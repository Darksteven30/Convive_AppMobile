-- =============================================================================================
-- Convive · Selección del concepto de pago (RF11)
--
-- Modelo: «conceptos_pago» es el catálogo de conceptos que se pueden pagar y «cartera» guarda el
-- saldo pendiente de cada unidad en cada concepto. El «Estado de la cuenta» es la suma de esos
-- saldos. La app solo lee la cartera; los saldos los cambia la administración (y, más adelante,
-- los pagos aprobados).
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create table public.conceptos_pago (
  -- ID estable del catálogo que usa la app: «administracion», «extraordinaria», «otros».
  id text primary key check (id ~ '^[a-z_]+$'),
  nombre text not null,
  -- «Otros conceptos» pide además una descripción de lo que se paga (5 a 100 caracteres).
  requiere_descripcion boolean not null default false,
  orden integer not null default 0,
  activo boolean not null default true
);

create table public.cartera (
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  concepto_id text not null references public.conceptos_pago (id),
  -- Decimal(18,2): saldo pendiente en pesos colombianos; nunca negativo.
  saldo numeric(18, 2) not null default 0 check (saldo >= 0),
  updated_at timestamptz not null default now(),
  primary key (unidad_id, concepto_id)
);

-- ---------------------------------------------------------------------------------------------
-- Catálogo de conceptos (datos de referencia, no de prueba)
-- ---------------------------------------------------------------------------------------------

insert into public.conceptos_pago (id, nombre, requiere_descripcion, orden) values
  ('administracion', 'Cuota administración', false, 1),
  ('extraordinaria', 'Cuota extraordinaria', false, 2),
  ('otros', 'Otros conceptos', true, 3);

-- ---------------------------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------------------------

create or replace function public.mi_unidad()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select unidad_id from public.perfiles where user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.conceptos_pago enable row level security;
alter table public.cartera enable row level security;

create policy "Ver el catálogo de conceptos"
  on public.conceptos_pago for select to authenticated
  using (true);

create policy "Ver la cartera de mi unidad"
  on public.cartera for select to authenticated
  using (unidad_id = public.mi_unidad());

create policy "La administración ve la cartera de su conjunto"
  on public.cartera for select to authenticated
  using (
    public.mi_rol() = 'administrador'
    and exists (
      select 1 from public.unidades u
       where u.id = cartera.unidad_id and u.conjunto_id = public.mi_conjunto()
    )
  );

-- Sin políticas de insert/update/delete: los saldos los cambia la administración desde el panel.

-- ---------------------------------------------------------------------------------------------
-- RF11 · Estado de la cuenta de la unidad en sesión
-- ---------------------------------------------------------------------------------------------

-- Todos los conceptos activos del catálogo con el saldo pendiente de la unidad (0 si no tiene).
create or replace function public.mi_estado_cuenta()
returns table (
  concepto_id text,
  nombre text,
  requiere_descripcion boolean,
  saldo numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.nombre, c.requiere_descripcion, coalesce(k.saldo, 0)
    from public.conceptos_pago c
    left join public.cartera k
      on k.concepto_id = c.id and k.unidad_id = public.mi_unidad()
   where c.activo
   order by c.orden, c.nombre;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.mi_unidad() from public, anon, authenticated;
revoke execute on function public.mi_estado_cuenta() from public, anon, authenticated;

grant execute on function public.mi_unidad() to authenticated;
grant execute on function public.mi_estado_cuenta() to authenticated;
