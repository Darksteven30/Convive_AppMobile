-- =============================================================================================
-- Convive · Autenticación y perfiles (RF01, RF16, RF17)
--
-- Modelo: la administración pre-registra a cada persona en «perfiles» (correo, unidad y rol).
-- Cuando la persona crea su contraseña en la app, Supabase Auth crea el usuario en auth.users y
-- el trigger «vincular_perfil» lo enlaza con su perfil. El rol nunca lo elige el usuario.
--
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create type public.rol as enum ('administrador', 'junta_directiva', 'residente', 'vigilancia');

create table public.conjuntos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  ciudad text,
  created_at timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  -- Identificación corta de la unidad: «56», «Torre 2 · 301», «Administración».
  nombre text not null,
  -- Texto completo para mostrar: «Casa # 56 Cali - Valle».
  direccion text,
  created_at timestamptz not null default now(),
  unique (conjunto_id, nombre)
);

create table public.perfiles (
  id uuid primary key default gen_random_uuid(),
  -- Vacío mientras la persona no haya creado su contraseña (cuenta pre-registrada).
  user_id uuid unique references auth.users (id) on delete set null,
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  unidad_id uuid references public.unidades (id) on delete set null,
  email text not null unique check (email = lower(btrim(email))),
  nombre text not null,
  -- RF16: celular colombiano de 10 dígitos que empieza por 3.
  telefono text check (telefono ~ '^3[0-9]{9}$'),
  rol public.rol not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index perfiles_conjunto_idx on public.perfiles (conjunto_id);

-- RF01: intentos fallidos de inicio de sesión. Solo se accede mediante las funciones de abajo.
create table public.intentos_login (
  email text primary key,
  fallidos integer not null default 0,
  bloqueado_hasta timestamptz
);

-- ---------------------------------------------------------------------------------------------
-- Funciones auxiliares para las políticas (security definer evita la recursión de RLS)
-- ---------------------------------------------------------------------------------------------

create or replace function public.mi_conjunto()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select conjunto_id from public.perfiles where user_id = auth.uid();
$$;

create or replace function public.mi_rol()
returns public.rol
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.perfiles where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: cada persona solo ve lo que le corresponde
-- ---------------------------------------------------------------------------------------------

alter table public.conjuntos enable row level security;
alter table public.unidades enable row level security;
alter table public.perfiles enable row level security;
alter table public.intentos_login enable row level security; -- sin políticas: nadie la lee directamente

create policy "Ver mi conjunto"
  on public.conjuntos for select to authenticated
  using (id = public.mi_conjunto());

create policy "Ver unidades de mi conjunto"
  on public.unidades for select to authenticated
  using (conjunto_id = public.mi_conjunto());

create policy "Ver mi perfil"
  on public.perfiles for select to authenticated
  using (user_id = auth.uid());

create policy "La administración ve los perfiles de su conjunto"
  on public.perfiles for select to authenticated
  using (conjunto_id = public.mi_conjunto() and public.mi_rol() = 'administrador');

-- No hay políticas de insert/update/delete: los cambios pasan por funciones que validan los datos
-- (p. ej. actualizar_telefono) o los hace la administración desde el panel de Supabase.

-- ---------------------------------------------------------------------------------------------
-- RF01 · Estado del correo (paso 1 del inicio de sesión)
-- ---------------------------------------------------------------------------------------------

create or replace function public.estado_correo(p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.id is null then 'not_found'
    when p.user_id is null then 'pending'
    else 'registered'
  end
  from (select 1) as uno
  left join public.perfiles p on p.email = lower(btrim(p_email));
$$;

-- ---------------------------------------------------------------------------------------------
-- RF01 · Bloqueo de 15 minutos tras 5 intentos fallidos
-- ---------------------------------------------------------------------------------------------

-- Devuelve los minutos que faltan para desbloquear la cuenta (0 si no está bloqueada).
create or replace function public.minutos_bloqueo(p_email text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select ceil(extract(epoch from (bloqueado_hasta - now())) / 60)::integer
       from public.intentos_login
      where email = lower(btrim(p_email)) and bloqueado_hasta > now()),
    0
  );
$$;

-- Registra el resultado de un intento. Si falló, devuelve los intentos que quedan (0 = bloqueada).
create or replace function public.registrar_intento(p_email text, p_exitoso boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_fallidos integer;
begin
  if p_exitoso then
    delete from public.intentos_login where email = v_email;
    return 5;
  end if;

  insert into public.intentos_login as i (email, fallidos)
  values (v_email, 1)
  on conflict (email) do update
    -- Si el bloqueo anterior ya venció, el conteo vuelve a empezar.
    set fallidos = case when i.bloqueado_hasta is not null and i.bloqueado_hasta <= now() then 1 else i.fallidos + 1 end,
        bloqueado_hasta = case when i.bloqueado_hasta is not null and i.bloqueado_hasta <= now() then null else i.bloqueado_hasta end
  returning fallidos into v_fallidos;

  if v_fallidos >= 5 then
    update public.intentos_login set bloqueado_hasta = now() + interval '15 minutes' where email = v_email;
    return 0;
  end if;
  return 5 - v_fallidos;
end;
$$;

-- Al recuperar la contraseña también se desbloquea la cuenta.
create or replace function public.desbloquear_cuenta()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.intentos_login
   where email = (select lower(email) from auth.users where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- RF01 · Enlazar el usuario de Supabase Auth con su perfil pre-registrado
-- ---------------------------------------------------------------------------------------------

create or replace function public.vincular_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.perfiles
     set user_id = new.id, updated_at = now()
   where email = lower(new.email) and user_id is null;

  if not found then
    -- Solo pueden crear cuenta los correos que la administración registró (MSG-RF01-03).
    raise exception 'Correo no registrado en ningún conjunto: %', new.email;
  end if;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.vincular_perfil();

-- ---------------------------------------------------------------------------------------------
-- RF16 · Perfil del usuario en sesión y actualización del teléfono
-- ---------------------------------------------------------------------------------------------

create or replace function public.mi_perfil()
returns table (
  id uuid,
  email text,
  nombre text,
  telefono text,
  rol public.rol,
  unidad text,
  direccion text,
  conjunto text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.email, p.nombre, p.telefono, p.rol, u.nombre, u.direccion, c.nombre
    from public.perfiles p
    join public.conjuntos c on c.id = p.conjunto_id
    left join public.unidades u on u.id = p.unidad_id
   where p.user_id = auth.uid();
$$;

-- El usuario solo puede cambiar su teléfono; correo, unidad y rol los cambia la administración.
create or replace function public.actualizar_telefono(p_telefono text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_telefono text := regexp_replace(p_telefono, '[^0-9]', '', 'g');
begin
  if v_telefono !~ '^3[0-9]{9}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  update public.perfiles set telefono = v_telefono, updated_at = now() where user_id = auth.uid();
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

-- Supabase concede EXECUTE a anon y authenticated por defecto: se quita y se concede solo lo necesario.
revoke execute on function public.estado_correo(text) from public, anon, authenticated;
revoke execute on function public.minutos_bloqueo(text) from public, anon, authenticated;
revoke execute on function public.registrar_intento(text, boolean) from public, anon, authenticated;
revoke execute on function public.desbloquear_cuenta() from public, anon, authenticated;
revoke execute on function public.mi_perfil() from public, anon, authenticated;
revoke execute on function public.actualizar_telefono(text) from public, anon, authenticated;
revoke execute on function public.mi_conjunto() from public, anon, authenticated;
revoke execute on function public.mi_rol() from public, anon, authenticated;
revoke execute on function public.vincular_perfil() from public, anon, authenticated;

-- Antes de iniciar sesión (rol anon) solo se puede consultar el correo y el bloqueo.
grant execute on function public.estado_correo(text) to anon, authenticated;
grant execute on function public.minutos_bloqueo(text) to anon, authenticated;
grant execute on function public.registrar_intento(text, boolean) to anon, authenticated;

grant execute on function public.desbloquear_cuenta() to authenticated;
grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.actualizar_telefono(text) to authenticated;
grant execute on function public.mi_conjunto() to authenticated;
grant execute on function public.mi_rol() to authenticated;
