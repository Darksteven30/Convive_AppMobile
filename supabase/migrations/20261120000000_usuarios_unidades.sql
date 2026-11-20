-- =============================================================================================
-- Convive · Administración de usuarios y unidades (RF20, propuesto)
--
-- La precondición de RF01 dice que la administración pre-registra cada correo y lo asocia a una
-- unidad y a un rol, y RF16 que el correo y la unidad solo los cambia la administración. Estas
-- funciones lo permiten desde el Panel, siempre dentro del conjunto de quien las usa:
--
--   · Unidades: listar, crear y editar (nombre y dirección). No se eliminan: borrar una unidad
--     borraría en cascada sus pagos, reservas y visitas.
--   · Personas: listar, pre-registrar (correo, nombre, teléfono, rol y unidad), editar y eliminar
--     un pre-registro mientras la persona no haya creado su cuenta. Cuando la persona crea su
--     contraseña, el trigger vincular_perfil la enlaza con este perfil (RF01).
--
-- Reglas: el correo de quien ya creó su cuenta no se cambia (también está en Supabase Auth); un
-- administrador no cambia su propio rol, y el conjunto no puede quedarse sin administrador.
--
-- Permisos: solo el administrador del conjunto. El conjunto y el usuario salen de la sesión
-- (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------------------------------

-- Perfil del administrador en sesión, o error sin_permiso.
create or replace function public.perfil_administrador()
returns public.perfiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return v_perfil;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF20 · Unidades
-- ---------------------------------------------------------------------------------------------

-- Unidades del conjunto con cuántas personas tienen asignadas, ordenadas por nombre.
create or replace function public.unidades_admin()
returns table (id uuid, nombre text, direccion text, personas integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
begin
  return query
    select u.id, u.nombre, u.direccion,
           (select count(*)::integer from public.perfiles p where p.unidad_id = u.id)
      from public.unidades u
     where u.conjunto_id = v_admin.conjunto_id
     order by u.nombre;
end;
$$;

-- Crea (p_id null) o edita una unidad. Nombre de 1 a 40 caracteres, único en el conjunto sin
-- importar mayúsculas; dirección opcional de hasta 120. Errores: sin_permiso, no_encontrada,
-- nombre_unidad_invalido, direccion_invalida y unidad_duplicada.
create or replace function public.guardar_unidad(p_id uuid, p_nombre text, p_direccion text default null)
returns table (id uuid, nombre text, direccion text, personas integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_direccion text := nullif(regexp_replace(btrim(coalesce(p_direccion, '')), '\s+', ' ', 'g'), '');
  v_id uuid := p_id;
begin
  if char_length(v_nombre) not between 1 and 40 then
    raise exception 'nombre_unidad_invalido' using errcode = '22023';
  end if;
  if v_direccion is not null and char_length(v_direccion) > 120 then
    raise exception 'direccion_invalida' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.unidades u
     where u.conjunto_id = v_admin.conjunto_id and lower(u.nombre) = lower(v_nombre)
       and u.id is distinct from p_id
  ) then
    raise exception 'unidad_duplicada' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.unidades (conjunto_id, nombre, direccion)
    values (v_admin.conjunto_id, v_nombre, v_direccion)
    returning unidades.id into v_id;
  else
    update public.unidades u set nombre = v_nombre, direccion = v_direccion
     where u.id = p_id and u.conjunto_id = v_admin.conjunto_id;
    if not found then
      raise exception 'no_encontrada' using errcode = 'P0002';
    end if;
  end if;

  return query
    select u.id, u.nombre, u.direccion,
           (select count(*)::integer from public.perfiles p where p.unidad_id = u.id)
      from public.unidades u
     where u.id = v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF20 · Personas
-- ---------------------------------------------------------------------------------------------

-- Personas del conjunto, ordenadas por nombre. tiene_cuenta: ya creó su contraseña (RF01); si no,
-- está pre-registrada.
create or replace function public.usuarios_conjunto()
returns table (
  id uuid,
  nombre text,
  email text,
  telefono text,
  rol public.rol,
  unidad_id uuid,
  unidad text,
  tiene_cuenta boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
begin
  return query
    select p.id, p.nombre, p.email, p.telefono, p.rol, p.unidad_id, u.nombre, p.user_id is not null
      from public.perfiles p
      left join public.unidades u on u.id = p.unidad_id
     where p.conjunto_id = v_admin.conjunto_id
     order by p.nombre;
end;
$$;

-- Valida los datos de una persona ya normalizados. La unidad es obligatoria para residentes y junta
-- directiva y, si se envía, debe ser del conjunto. Errores: correo_invalido, nombre_invalido,
-- telefono_invalido, rol_invalido y unidad_requerida.
create or replace function public.validar_usuario(
  p_conjunto uuid,
  p_email text,
  p_nombre text,
  p_telefono text,
  p_rol public.rol,
  p_unidad_id uuid
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if char_length(p_email) > 100 or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'correo_invalido' using errcode = '22023';
  end if;
  if char_length(p_nombre) not between 3 and 80 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  if p_telefono is not null and p_telefono !~ '^3[0-9]{9}$' then
    raise exception 'telefono_invalido' using errcode = '22023';
  end if;
  if p_rol is null then
    raise exception 'rol_invalido' using errcode = '22023';
  end if;
  if (p_unidad_id is null and p_rol in ('residente', 'junta_directiva'))
     or (p_unidad_id is not null and not exists (
       select 1 from public.unidades u where u.id = p_unidad_id and u.conjunto_id = p_conjunto
     )) then
    raise exception 'unidad_requerida' using errcode = '22023';
  end if;
end;
$$;

-- Pre-registra a una persona: cuando entre a la app con este correo, creará su contraseña (RF01).
-- Errores: sin_permiso, correo_duplicado y los de validar_usuario().
create or replace function public.preregistrar_usuario(
  p_email text,
  p_nombre text,
  p_rol public.rol,
  p_unidad_id uuid default null,
  p_telefono text default null
)
returns table (
  id uuid,
  nombre text,
  email text,
  telefono text,
  rol public.rol,
  unidad_id uuid,
  unidad text,
  tiene_cuenta boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_telefono text := nullif(regexp_replace(coalesce(p_telefono, ''), '\s', '', 'g'), '');
  v_id uuid;
begin
  perform public.validar_usuario(v_admin.conjunto_id, v_email, v_nombre, v_telefono, p_rol, p_unidad_id);
  -- El correo es único en toda la app: una persona entra a un solo conjunto.
  if exists (select 1 from public.perfiles p where p.email = v_email) then
    raise exception 'correo_duplicado' using errcode = '23505';
  end if;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, telefono, rol)
  values (v_admin.conjunto_id, p_unidad_id, v_email, v_nombre, v_telefono, p_rol)
  returning perfiles.id into v_id;

  return query
    select p.id, p.nombre, p.email, p.telefono, p.rol, p.unidad_id, u.nombre, p.user_id is not null
      from public.perfiles p
      left join public.unidades u on u.id = p.unidad_id
     where p.id = v_id;
end;
$$;

-- Edita a una persona del conjunto. El correo solo cambia mientras no tenga cuenta (correo_bloqueado);
-- el administrador no cambia su propio rol (rol_propio) y el conjunto no se queda sin administrador
-- (ultimo_administrador). Errores: además, sin_permiso, no_encontrada, correo_duplicado y los de
-- validar_usuario().
create or replace function public.editar_usuario(
  p_id uuid,
  p_email text,
  p_nombre text,
  p_rol public.rol,
  p_unidad_id uuid default null,
  p_telefono text default null
)
returns table (
  id uuid,
  nombre text,
  email text,
  telefono text,
  rol public.rol,
  unidad_id uuid,
  unidad text,
  tiene_cuenta boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
  v_perfil public.perfiles;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_telefono text := nullif(regexp_replace(coalesce(p_telefono, ''), '\s', '', 'g'), '');
begin
  -- Se bloquea el perfil: dos administradores editando a la vez no se pisan las reglas de rol.
  select * into v_perfil from public.perfiles p
   where p.id = p_id and p.conjunto_id = v_admin.conjunto_id
     for update;
  if v_perfil.id is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;

  perform public.validar_usuario(v_admin.conjunto_id, v_email, v_nombre, v_telefono, p_rol, p_unidad_id);

  if v_email <> v_perfil.email then
    if v_perfil.user_id is not null then
      raise exception 'correo_bloqueado' using errcode = '22023';
    end if;
    if exists (select 1 from public.perfiles p where p.email = v_email) then
      raise exception 'correo_duplicado' using errcode = '23505';
    end if;
  end if;

  if p_rol <> v_perfil.rol then
    if v_perfil.id = v_admin.id then
      raise exception 'rol_propio' using errcode = '22023';
    end if;
    if v_perfil.rol = 'administrador' and not exists (
      select 1 from public.perfiles p
       where p.conjunto_id = v_admin.conjunto_id and p.rol = 'administrador' and p.id <> v_perfil.id
    ) then
      raise exception 'ultimo_administrador' using errcode = '22023';
    end if;
  end if;

  update public.perfiles p
     set email = v_email, nombre = v_nombre, telefono = v_telefono, rol = p_rol,
         unidad_id = p_unidad_id, updated_at = now()
   where p.id = v_perfil.id;

  return query
    select p.id, p.nombre, p.email, p.telefono, p.rol, p.unidad_id, u.nombre, p.user_id is not null
      from public.perfiles p
      left join public.unidades u on u.id = p.unidad_id
     where p.id = v_perfil.id;
end;
$$;

-- Elimina un pre-registro: solo de quien todavía no creó su cuenta. Errores: sin_permiso,
-- no_encontrada y usuario_con_cuenta.
create or replace function public.eliminar_preregistro(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.perfiles := public.perfil_administrador();
  v_perfil public.perfiles;
begin
  select * into v_perfil from public.perfiles p
   where p.id = p_id and p.conjunto_id = v_admin.conjunto_id
     for update;
  if v_perfil.id is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  if v_perfil.user_id is not null then
    raise exception 'usuario_con_cuenta' using errcode = '22023';
  end if;

  delete from public.perfiles p where p.id = v_perfil.id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.perfil_administrador() from public, anon, authenticated;
revoke execute on function public.validar_usuario(uuid, text, text, text, public.rol, uuid) from public, anon, authenticated;
revoke execute on function public.unidades_admin() from public, anon, authenticated;
revoke execute on function public.guardar_unidad(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.usuarios_conjunto() from public, anon, authenticated;
revoke execute on function public.preregistrar_usuario(text, text, public.rol, uuid, text) from public, anon, authenticated;
revoke execute on function public.editar_usuario(uuid, text, text, public.rol, uuid, text) from public, anon, authenticated;
revoke execute on function public.eliminar_preregistro(uuid) from public, anon, authenticated;

grant execute on function public.unidades_admin() to authenticated;
grant execute on function public.guardar_unidad(uuid, text, text) to authenticated;
grant execute on function public.usuarios_conjunto() to authenticated;
grant execute on function public.preregistrar_usuario(text, text, public.rol, uuid, text) to authenticated;
grant execute on function public.editar_usuario(uuid, text, text, public.rol, uuid, text) to authenticated;
grant execute on function public.eliminar_preregistro(uuid) to authenticated;
