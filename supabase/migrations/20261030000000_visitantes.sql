-- =============================================================================================
-- Convive · Registro de ingreso y salida de visitantes (RF10)
--
-- Modelo: «visitas» guarda cada ingreso de un visitante al conjunto: nombre, tipo y número de
-- documento, la unidad que autoriza, la placa (opcional) y las horas de entrada y salida, con
-- quién registró cada una. Las horas las pone el servidor (now()); la app nunca las envía.
-- Una visita está «dentro» mientras no tenga hora de salida, y un mismo documento solo puede
-- tener una visita activa por conjunto.
--
-- Reglas: nombre de 3 a 80 caracteres, solo letras y espacios; CC, CE y TI de 5 a 12 dígitos y
-- pasaporte de 5 a 15 letras o números; unidad del conjunto obligatoria; placa opcional AAA123
-- (carro) o AAA12A (moto). No se registra la salida de una visita sin entrada activa.
--
-- Permisos: solo la vigilancia del conjunto registra y consulta las visitas. El conjunto y el
-- usuario salen de la sesión (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create type public.tipo_documento as enum ('CC', 'CE', 'TI', 'PASAPORTE');

create table public.visitas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  nombre text not null check (char_length(nombre) between 3 and 80 and nombre ~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$'),
  tipo_documento public.tipo_documento not null,
  numero_documento text not null check (
    (tipo_documento = 'PASAPORTE' and numero_documento ~ '^[A-Z0-9]{5,15}$')
    or (tipo_documento <> 'PASAPORTE' and numero_documento ~ '^[0-9]{5,12}$')
  ),
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  placa text check (placa ~ '^[A-Z]{3}([0-9]{3}|[0-9]{2}[A-Z])$'),
  entrada timestamptz not null default now(),
  salida timestamptz,
  -- Auditoría: quién registró la entrada y la salida.
  entrada_por uuid not null references public.perfiles (id),
  salida_por uuid references public.perfiles (id),
  check (salida is null or salida >= entrada),
  check ((salida is null) = (salida_por is null))
);

-- Un documento solo puede estar «dentro» una vez por conjunto.
create unique index visitas_activa_unica_idx
  on public.visitas (conjunto_id, tipo_documento, numero_documento)
  where salida is null;
-- Autocompletar el nombre: el último registro de un documento.
create index visitas_documento_idx on public.visitas (conjunto_id, tipo_documento, numero_documento, entrada desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.visitas enable row level security;

create policy "La vigilancia ve las visitas de su conjunto"
  on public.visitas for select to authenticated
  using (conjunto_id = public.mi_conjunto() and public.mi_rol() = 'vigilancia');

-- Sin políticas de insert/update/delete: las visitas se registran con registrar_entrada_visitante()
-- y registrar_salida_visitante(), que validan los datos y ponen la hora del servidor.

-- ---------------------------------------------------------------------------------------------
-- RF10 · Datos para el formulario
-- ---------------------------------------------------------------------------------------------

-- Unidades del conjunto para el selector «Unidad que autoriza». Error: sin_permiso.
create or replace function public.unidades_visita()
returns table (id uuid, nombre text, direccion text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'vigilancia' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  return query
    select u.id, u.nombre, u.direccion
      from public.unidades u
     where u.conjunto_id = public.mi_conjunto()
     order by u.nombre;
end;
$$;

-- Nombre del último registro con ese documento en el conjunto (para autocompletar), o null.
-- Error: sin_permiso.
create or replace function public.buscar_visitante(p_tipo_documento public.tipo_documento, p_numero_documento text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'vigilancia' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  return (
    select v.nombre
      from public.visitas v
     where v.conjunto_id = public.mi_conjunto()
       and v.tipo_documento = p_tipo_documento
       and v.numero_documento = upper(regexp_replace(coalesce(p_numero_documento, ''), '[\s.-]', '', 'g'))
     order by v.entrada desc
     limit 1
  );
end;
$$;

-- Visitantes con una entrada activa (sin salida), del más reciente al más antiguo.
-- Error: sin_permiso.
create or replace function public.visitantes_dentro()
returns table (
  id uuid,
  nombre text,
  tipo_documento public.tipo_documento,
  numero_documento text,
  unidad text,
  placa text,
  entrada timestamptz,
  salida timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'vigilancia' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  return query
    select v.id, v.nombre, v.tipo_documento, v.numero_documento, u.nombre, v.placa, v.entrada, v.salida
      from public.visitas v
      join public.unidades u on u.id = v.unidad_id
     where v.conjunto_id = public.mi_conjunto()
       and v.salida is null
     order by v.entrada desc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF10 · Registrar la entrada
-- ---------------------------------------------------------------------------------------------

-- La hora de entrada es la del servidor (now()). Errores (los traduce visitors.supabase.ts):
-- sin_permiso, nombre_invalido, documento_invalido (MSG-RF10-04), unidad_invalida (MSG-RF10-05;
-- vacía o de otro conjunto), placa_invalida (MSG-RF10-06) y ya_dentro (el documento ya tiene una
-- entrada activa).
create or replace function public.registrar_entrada_visitante(
  p_nombre text,
  p_tipo_documento public.tipo_documento,
  p_numero_documento text,
  p_unidad_id uuid,
  p_placa text default null
)
returns table (
  id uuid,
  nombre text,
  tipo_documento public.tipo_documento,
  numero_documento text,
  unidad text,
  placa text,
  entrada timestamptz,
  salida timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_numero text := upper(regexp_replace(coalesce(p_numero_documento, ''), '[\s.-]', '', 'g'));
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[\s-]', '', 'g')), '');
  v_unidad public.unidades;
  v_id uuid;
  v_entrada timestamptz;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'vigilancia' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if char_length(v_nombre) not between 3 and 80 or v_nombre !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$' then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;

  if p_tipo_documento is null
     or (p_tipo_documento = 'PASAPORTE' and v_numero !~ '^[A-Z0-9]{5,15}$')
     or (p_tipo_documento <> 'PASAPORTE' and v_numero !~ '^[0-9]{5,12}$') then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;

  select * into v_unidad
    from public.unidades u
   where u.id = p_unidad_id and u.conjunto_id = v_perfil.conjunto_id;
  if v_unidad.id is null then
    raise exception 'unidad_invalida' using errcode = '22023';
  end if;

  if v_placa is not null and v_placa !~ '^[A-Z]{3}([0-9]{3}|[0-9]{2}[A-Z])$' then
    raise exception 'placa_invalida' using errcode = '22023';
  end if;

  -- Dos registros del mismo documento al mismo tiempo se atienden en orden: el segundo ya ve la
  -- entrada activa del primero.
  perform pg_advisory_xact_lock(
    hashtextextended('visita|' || v_perfil.conjunto_id::text || '|' || p_tipo_documento::text || '|' || v_numero, 0)
  );
  if exists (
    select 1 from public.visitas v
     where v.conjunto_id = v_perfil.conjunto_id
       and v.tipo_documento = p_tipo_documento
       and v.numero_documento = v_numero
       and v.salida is null
  ) then
    raise exception 'ya_dentro' using errcode = '23505';
  end if;

  insert into public.visitas (conjunto_id, nombre, tipo_documento, numero_documento, unidad_id, placa, entrada_por)
  values (v_perfil.conjunto_id, v_nombre, p_tipo_documento, v_numero, v_unidad.id, v_placa, v_perfil.id)
  returning visitas.id, visitas.entrada into v_id, v_entrada;

  return query select v_id, v_nombre, p_tipo_documento, v_numero, v_unidad.nombre, v_placa, v_entrada, null::timestamptz;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF10 · Registrar la salida
-- ---------------------------------------------------------------------------------------------

-- La hora de salida es la del servidor. Errores: sin_permiso y sin_entrada_activa (MSG-RF10-03:
-- la visita no existe, es de otro conjunto o ya tiene salida).
create or replace function public.registrar_salida_visitante(p_id uuid)
returns table (
  id uuid,
  nombre text,
  tipo_documento public.tipo_documento,
  numero_documento text,
  unidad text,
  placa text,
  entrada timestamptz,
  salida timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_visita public.visitas;
  v_salida timestamptz := now();
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'vigilancia' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Se bloquea la visita: si dos vigilantes registran la salida al tiempo, el segundo ve que ya salió.
  select * into v_visita
    from public.visitas v
   where v.id = p_id and v.conjunto_id = v_perfil.conjunto_id
     for update;
  if v_visita.id is null or v_visita.salida is not null then
    raise exception 'sin_entrada_activa' using errcode = '22023';
  end if;

  update public.visitas v set salida = v_salida, salida_por = v_perfil.id where v.id = v_visita.id;

  return query
    select v_visita.id, v_visita.nombre, v_visita.tipo_documento, v_visita.numero_documento, u.nombre,
           v_visita.placa, v_visita.entrada, v_salida
      from public.unidades u
     where u.id = v_visita.unidad_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.unidades_visita() from public, anon, authenticated;
revoke execute on function public.buscar_visitante(public.tipo_documento, text) from public, anon, authenticated;
revoke execute on function public.visitantes_dentro() from public, anon, authenticated;
revoke execute on function public.registrar_entrada_visitante(text, public.tipo_documento, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.registrar_salida_visitante(uuid) from public, anon, authenticated;

grant execute on function public.unidades_visita() to authenticated;
grant execute on function public.buscar_visitante(public.tipo_documento, text) to authenticated;
grant execute on function public.visitantes_dentro() to authenticated;
grant execute on function public.registrar_entrada_visitante(text, public.tipo_documento, text, uuid, text) to authenticated;
grant execute on function public.registrar_salida_visitante(uuid) to authenticated;
