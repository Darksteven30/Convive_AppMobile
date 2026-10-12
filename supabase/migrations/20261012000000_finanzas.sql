-- =============================================================================================
-- Convive · Finanzas: registro de ingresos y egresos (RF03) y reportes filtrables (RF04)
--
-- Modelo: «categorias_financieras» es el catálogo de categorías por tipo (ingreso o egreso) y
-- «movimientos» guarda cada ingreso o egreso del conjunto con su auditoría (quién y cuándo lo
-- registró). El soporte (PDF, JPG o PNG de máx. 5 MB) se guarda en el bucket privado
-- «soportes-financieros» de Supabase Storage, dentro de la carpeta del conjunto.
--
-- Permisos: solo el administrador registra movimientos y sube soportes; el administrador y la
-- junta directiva (solo lectura) los consultan. Residentes y vigilancia no ven las finanzas.
-- El conjunto y el usuario salen de la sesión (auth.uid()), nunca de un dato enviado por la app.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create type public.tipo_movimiento as enum ('ingreso', 'egreso');

create table public.categorias_financieras (
  -- ID estable del catálogo que usa la app: «ing-admin», «egr-nomina»…
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  nombre text not null,
  tipo public.tipo_movimiento not null,
  -- Las inactivas no se ofrecen al registrar, pero siguen en los reportes de movimientos antiguos.
  activa boolean not null default true
);

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  tipo public.tipo_movimiento not null,
  categoria_id text not null references public.categorias_financieras (id),
  -- Decimal(18,2) en pesos colombianos: mayor a 0 y hasta $ 999.999.999,99.
  monto numeric(18, 2) not null check (monto > 0 and monto <= 999999999.99),
  fecha date not null,
  descripcion text not null check (char_length(descripcion) between 5 and 250),
  -- Soporte opcional en Storage: «{conjunto_id}/{archivo}».
  soporte_ruta text,
  soporte_nombre text,
  soporte_tipo text check (soporte_tipo in ('application/pdf', 'image/jpeg', 'image/png')),
  soporte_bytes integer check (soporte_bytes > 0 and soporte_bytes <= 5242880),
  -- Auditoría: quién y cuándo registró el movimiento.
  registrado_por uuid not null references public.perfiles (id),
  created_at timestamptz not null default now(),
  check ((soporte_ruta is null) = (soporte_tipo is null))
);

create index movimientos_conjunto_fecha_idx on public.movimientos (conjunto_id, fecha);

-- ---------------------------------------------------------------------------------------------
-- Catálogo de categorías (datos de referencia, no de prueba). Los mismos IDs que finance.mock.ts.
-- ---------------------------------------------------------------------------------------------

insert into public.categorias_financieras (id, nombre, tipo, activa) values
  ('ing-admin', 'Cuotas de administración', 'ingreso', true),
  ('ing-extra', 'Cuotas extraordinarias', 'ingreso', true),
  ('ing-zonas', 'Alquiler de zonas comunes', 'ingreso', true),
  ('ing-multas', 'Multas e intereses', 'ingreso', true),
  ('ing-otros', 'Otros ingresos', 'ingreso', true),
  ('ing-donaciones', 'Donaciones', 'ingreso', false),
  ('egr-nomina', 'Nómina', 'egreso', true),
  ('egr-mantenimiento', 'Mantenimiento', 'egreso', true),
  ('egr-servicios', 'Servicios públicos', 'egreso', true),
  ('egr-vigilancia', 'Vigilancia y seguridad', 'egreso', true),
  ('egr-aseo', 'Aseo', 'egreso', true),
  ('egr-papeleria', 'Papelería y administración', 'egreso', true),
  ('egr-otros', 'Otros egresos', 'egreso', true),
  ('egr-eventos', 'Eventos', 'egreso', false);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.categorias_financieras enable row level security;
alter table public.movimientos enable row level security;

create policy "Ver el catálogo de categorías financieras"
  on public.categorias_financieras for select to authenticated
  using (true);

create policy "Administración y junta ven los movimientos de su conjunto"
  on public.movimientos for select to authenticated
  using (
    conjunto_id = public.mi_conjunto()
    and public.mi_rol() in ('administrador', 'junta_directiva')
  );

-- Sin políticas de insert/update/delete: los movimientos se registran con registrar_movimiento(),
-- que valida los datos. Un movimiento registrado no se edita (trazabilidad).

-- ---------------------------------------------------------------------------------------------
-- RF03 · Registrar un ingreso o egreso
-- ---------------------------------------------------------------------------------------------

-- Errores (los traduce finance.supabase.ts): sin_permiso (MSG-RF03-07), categoria_invalida
-- (MSG-RF03-03), monto_invalido (MSG-RF03-02), fecha_futura (MSG-RF03-04), descripcion_invalida
-- (MSG-RF03-05) y soporte_invalido (MSG-RF03-08).
create or replace function public.registrar_movimiento(
  p_tipo public.tipo_movimiento,
  p_categoria_id text,
  p_monto numeric,
  p_fecha date,
  p_descripcion text,
  p_soporte_ruta text default null,
  p_soporte_nombre text default null,
  p_soporte_tipo text default null,
  p_soporte_bytes integer default null
)
returns table (
  id uuid,
  categoria text,
  registrado_por_id uuid,
  registrado_por text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_descripcion text := btrim(coalesce(p_descripcion, ''));
  v_categoria text;
  v_id uuid;
  v_creado timestamptz;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select c.nombre into v_categoria
    from public.categorias_financieras c
   where c.id = p_categoria_id and c.activa and c.tipo = p_tipo;
  if v_categoria is null then
    raise exception 'categoria_invalida' using errcode = '22023';
  end if;

  if p_monto is null or p_monto <= 0 or p_monto > 999999999.99 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  -- «Hoy» en la hora de Colombia.
  if p_fecha is null or p_fecha > (now() at time zone 'America/Bogota')::date then
    raise exception 'fecha_futura' using errcode = '22023';
  end if;

  if char_length(v_descripcion) not between 5 and 250 then
    raise exception 'descripcion_invalida' using errcode = '22023';
  end if;

  -- El soporte debe estar en la carpeta del propio conjunto.
  if p_soporte_ruta is not null and (
       split_part(p_soporte_ruta, '/', 1) <> v_perfil.conjunto_id::text
       or nullif(btrim(coalesce(p_soporte_nombre, '')), '') is null
       or p_soporte_tipo is null
       or p_soporte_tipo not in ('application/pdf', 'image/jpeg', 'image/png')
       or p_soporte_bytes is null or p_soporte_bytes <= 0 or p_soporte_bytes > 5242880
     ) then
    raise exception 'soporte_invalido' using errcode = '22023';
  end if;

  insert into public.movimientos (
    conjunto_id, tipo, categoria_id, monto, fecha, descripcion,
    soporte_ruta, soporte_nombre, soporte_tipo, soporte_bytes, registrado_por
  )
  values (
    v_perfil.conjunto_id, p_tipo, p_categoria_id, round(p_monto, 2), p_fecha, v_descripcion,
    p_soporte_ruta, case when p_soporte_ruta is null then null else btrim(p_soporte_nombre) end,
    case when p_soporte_ruta is null then null else p_soporte_tipo end,
    case when p_soporte_ruta is null then null else p_soporte_bytes end,
    v_perfil.id
  )
  returning movimientos.id, movimientos.created_at into v_id, v_creado;

  return query select v_id, v_categoria, v_perfil.id, v_perfil.nombre, v_creado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF03 / RF04 · Consultar los movimientos del conjunto
-- ---------------------------------------------------------------------------------------------

-- Sin fechas devuelve todos los movimientos (lista de Finanzas). Con fechas aplica las reglas de
-- RF04: fecha inicial ≤ final, final no posterior a hoy y rango máximo de 12 meses (rango_invalido).
-- p_categoria_id null = todas las categorías. Del más reciente al más antiguo.
-- Es security definer para leer el nombre de quien registró (la junta no ve otros perfiles), por
-- eso valida el rol y filtra por el conjunto de la sesión.
create or replace function public.movimientos_financieros(
  p_desde date default null,
  p_hasta date default null,
  p_categoria_id text default null
)
returns table (
  id uuid,
  tipo public.tipo_movimiento,
  categoria_id text,
  categoria text,
  monto numeric,
  fecha date,
  descripcion text,
  soporte_ruta text,
  soporte_nombre text,
  soporte_tipo text,
  soporte_bytes integer,
  registrado_por_id uuid,
  registrado_por text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is null or public.mi_rol() not in ('administrador', 'junta_directiva') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if (p_desde is not null or p_hasta is not null) and (
       p_desde is null or p_hasta is null
       or p_desde > p_hasta
       or p_hasta > (now() at time zone 'America/Bogota')::date
       or p_hasta > (p_desde + interval '12 months')::date
     ) then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  return query
    select m.id, m.tipo, m.categoria_id, c.nombre, m.monto, m.fecha, m.descripcion,
           m.soporte_ruta, m.soporte_nombre, m.soporte_tipo, m.soporte_bytes,
           p.id, p.nombre, m.created_at
      from public.movimientos m
      join public.categorias_financieras c on c.id = m.categoria_id
      join public.perfiles p on p.id = m.registrado_por
     where m.conjunto_id = public.mi_conjunto()
       and (p_desde is null or m.fecha between p_desde and p_hasta)
       and (p_categoria_id is null or m.categoria_id = p_categoria_id)
     order by m.fecha desc, m.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Soportes en Supabase Storage (bucket privado, máx. 5 MB, PDF/JPG/PNG)
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('soportes-financieros', 'soportes-financieros', false, 5242880,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "La administración sube soportes de su conjunto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'soportes-financieros'
    and public.mi_rol() = 'administrador'
    and (storage.foldername(name))[1] = public.mi_conjunto()::text
  );

create policy "Administración y junta ven los soportes de su conjunto"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'soportes-financieros'
    and public.mi_rol() in ('administrador', 'junta_directiva')
    and (storage.foldername(name))[1] = public.mi_conjunto()::text
  );

-- Si el movimiento no se pudo guardar, la app borra el soporte que acababa de subir.
create policy "La administración borra soportes de su conjunto"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'soportes-financieros'
    and public.mi_rol() = 'administrador'
    and (storage.foldername(name))[1] = public.mi_conjunto()::text
  );

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.registrar_movimiento(public.tipo_movimiento, text, numeric, date, text, text, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.movimientos_financieros(date, date, text) from public, anon, authenticated;

grant execute on function public.registrar_movimiento(public.tipo_movimiento, text, numeric, date, text, text, text, text, integer)
  to authenticated;
grant execute on function public.movimientos_financieros(date, date, text) to authenticated;
