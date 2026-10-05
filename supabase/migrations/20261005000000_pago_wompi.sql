-- =============================================================================================
-- Convive · Pago a través de la pasarela Wompi (RF12)
--
-- Modelo: cada conjunto tiene su cuenta de comercio Wompi («wompi_conjuntos»: llave pública y
-- medios habilitados). Al pulsar «Pagar con Wompi», la función iniciar_pago() valida el concepto y
-- el valor, crea la transacción local en estado PENDIENTE, genera la referencia única y calcula la
-- firma de integridad. La app solo recibe lo necesario para abrir el Widget; nunca el secreto.
--
-- Secreto de integridad: se guarda en el Vault de Supabase (cifrado), uno por conjunto, con el
-- nombre «wompi_integridad_<id del conjunto>». Ejemplo (SQL Editor, con el secreto de Sandbox):
--   select vault.create_secret('test_integrity_XXXX', 'wompi_integridad_' || id) from conjuntos where ...;
-- Sin llave pública o sin secreto, el pago responde «wompi_no_disponible» (MSG-RF12-04).
--
-- Requiere: 20261004000000_seleccion_concepto_pago.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

-- Estados de la transacción local. CANCELADA: la persona cerró la ventana de Wompi sin pagar.
-- APROBADA, RECHAZADA, ERROR y ANULADA los asigna la confirmación con Wompi (RF13 y RF15).
create type public.estado_transaccion as enum ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'ERROR', 'ANULADA', 'CANCELADA');

create table public.wompi_conjuntos (
  conjunto_id uuid primary key references public.conjuntos (id) on delete cascade,
  ambiente text not null default 'sandbox' check (ambiente in ('sandbox', 'produccion')),
  -- Llave pública de Wompi (pub_test_… en Sandbox, pub_prod_… en Producción). Es la única que viaja a la app.
  llave_publica text check (llave_publica ~ '^pub_(test|prod)_'),
  -- Medios que el conjunto tiene habilitados en su cuenta Wompi (se muestran como chips informativos).
  medios_habilitados text[] not null default array['CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA']
    check (medios_habilitados <@ array['CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA']),
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.transacciones_pago (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  concepto_id text not null references public.conceptos_pago (id),
  -- Solo en los conceptos que la piden («Otros conceptos»).
  descripcion text check (descripcion is null or char_length(descripcion) between 5 and 100),
  monto numeric(18, 2) not null check (monto > 0),
  -- Wompi recibe el valor en centavos: $ 45.678,90 → 4567890.
  monto_centavos bigint not null check (monto_centavos = (monto * 100)::bigint),
  moneda text not null default 'COP' check (moneda = 'COP'),
  -- Única y nunca repetida, ni en reintentos (máx. 50 caracteres, límite de Wompi).
  referencia text not null unique check (char_length(referencia) <= 50),
  -- SHA-256 de referencia + centavos + moneda + secreto de integridad, calculada en el servidor.
  firma text not null,
  estado public.estado_transaccion not null default 'PENDIENTE',
  -- Los completa la confirmación con Wompi (RF13 y RF15).
  wompi_id text unique,
  medio_pago text,
  creada_por uuid not null references public.perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Regla de negocio: un solo pago PENDIENTE por unidad y concepto (MSG-RF12-03).
create unique index transacciones_un_pendiente_por_concepto
  on public.transacciones_pago (unidad_id, concepto_id)
  where estado = 'PENDIENTE';

create index transacciones_unidad_idx on public.transacciones_pago (unidad_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.wompi_conjuntos enable row level security; -- sin políticas: se lee con las funciones
alter table public.transacciones_pago enable row level security;

create policy "Ver los pagos de mi unidad"
  on public.transacciones_pago for select to authenticated
  using (unidad_id = public.mi_unidad());

create policy "La administración ve los pagos de su conjunto"
  on public.transacciones_pago for select to authenticated
  using (
    public.mi_rol() = 'administrador'
    and exists (
      select 1 from public.unidades u
       where u.id = transacciones_pago.unidad_id and u.conjunto_id = public.mi_conjunto()
    )
  );

-- Sin políticas de insert/update/delete: las transacciones se crean y cambian con las funciones.

-- ---------------------------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------------------------

-- Secreto de integridad del conjunto (Vault). null si no está configurado.
create or replace function public.secreto_integridad_wompi(p_conjunto_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wompi_integridad_' || p_conjunto_id::text;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF12 · Medios de pago del conjunto (chips informativos)
-- ---------------------------------------------------------------------------------------------

create or replace function public.pasarela_pagos()
returns table (disponible boolean, medios text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(w.activo and w.llave_publica is not null
             and public.secreto_integridad_wompi(w.conjunto_id) is not null, false),
    coalesce(w.medios_habilitados, array[]::text[])
    from (select 1) as uno
    left join public.wompi_conjuntos w on w.conjunto_id = public.mi_conjunto();
$$;

-- ---------------------------------------------------------------------------------------------
-- RF12 · Iniciar el pago: transacción PENDIENTE, referencia única y firma de integridad
-- ---------------------------------------------------------------------------------------------

-- Errores (en el mensaje): concepto_invalido, valor_invalido, descripcion_invalida, sin_unidad,
-- pago_pendiente (el detalle trae el id de la transacción en proceso) y wompi_no_disponible.
create or replace function public.iniciar_pago(p_concepto_id text, p_valor numeric, p_descripcion text default null)
returns table (
  transaccion_id uuid,
  referencia text,
  monto_centavos bigint,
  moneda text,
  firma text,
  llave_publica text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- Las columnas de salida (referencia, firma…) se llaman igual que las de la tabla.
#variable_conflict use_column
declare
  v_perfil public.perfiles%rowtype;
  v_unidad public.unidades%rowtype;
  v_concepto public.conceptos_pago%rowtype;
  v_saldo numeric(18, 2);
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_pendiente uuid;
  v_wompi public.wompi_conjuntos%rowtype;
  v_secreto text;
  v_referencia text;
  v_centavos bigint;
  v_firma text;
  v_id uuid;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.unidad_id is null then
    raise exception 'sin_unidad' using errcode = 'P0002';
  end if;
  select * into v_unidad from public.unidades where id = v_perfil.unidad_id;

  -- Las mismas reglas de RF11: la app valida para guiar, pero el servidor no confía en ella.
  select * into v_concepto from public.conceptos_pago where id = p_concepto_id and activo;
  if v_concepto.id is null then
    raise exception 'concepto_invalido' using errcode = '22023';
  end if;

  select coalesce((select saldo from public.cartera
                    where unidad_id = v_unidad.id and concepto_id = v_concepto.id), 0)
    into v_saldo;
  if p_valor is null or p_valor <= 0 or p_valor <> round(p_valor, 2) or p_valor > 999999999.99
     or (v_saldo > 0 and p_valor > v_saldo) then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;

  if v_concepto.requiere_descripcion and (v_descripcion is null or char_length(v_descripcion) not between 5 and 100) then
    raise exception 'descripcion_invalida' using errcode = '22023';
  end if;
  if not v_concepto.requiere_descripcion then
    v_descripcion := null;
  end if;

  -- MSG-RF12-03: no se permite un segundo pago del mismo concepto mientras haya uno en proceso.
  select id into v_pendiente from public.transacciones_pago
   where unidad_id = v_unidad.id and concepto_id = v_concepto.id and estado = 'PENDIENTE';
  if v_pendiente is not null then
    raise exception 'pago_pendiente' using errcode = 'P0001', detail = v_pendiente::text;
  end if;

  -- MSG-RF12-04: el conjunto debe tener su cuenta Wompi activa (llave pública y secreto).
  select * into v_wompi from public.wompi_conjuntos where conjunto_id = v_unidad.conjunto_id and activo;
  v_secreto := public.secreto_integridad_wompi(v_unidad.conjunto_id);
  if v_wompi.llave_publica is null or v_secreto is null then
    raise exception 'wompi_no_disponible' using errcode = 'P0001';
  end if;

  -- CNV-{unidad}-{aaaammddhhmmss}-{aleatorio}: única por unidad y momento, incluso en reintentos.
  v_referencia := 'CNV-' || left(regexp_replace(v_unidad.nombre, '[^A-Za-z0-9]', '', 'g'), 20)
    || '-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDDHH24MISS')
    || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  v_centavos := (p_valor * 100)::bigint;
  v_firma := encode(extensions.digest(v_referencia || v_centavos::text || 'COP' || v_secreto, 'sha256'), 'hex');

  begin
    insert into public.transacciones_pago
      (unidad_id, concepto_id, descripcion, monto, monto_centavos, moneda, referencia, firma, creada_por)
    values
      (v_unidad.id, v_concepto.id, v_descripcion, p_valor, v_centavos, 'COP', v_referencia, v_firma, v_perfil.id)
    returning id into v_id;
  exception when unique_violation then
    -- Dos pulsaciones simultáneas: el índice único deja pasar solo una.
    select id into v_pendiente from public.transacciones_pago
     where unidad_id = v_unidad.id and concepto_id = v_concepto.id and estado = 'PENDIENTE';
    raise exception 'pago_pendiente' using errcode = 'P0001', detail = coalesce(v_pendiente::text, '');
  end;

  return query select v_id, v_referencia, v_centavos, 'COP'::text, v_firma, v_wompi.llave_publica;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF12 · La persona cerró la ventana de Wompi sin pagar (MSG-RF12-02)
-- ---------------------------------------------------------------------------------------------

-- Solo cancela pagos propios que sigan PENDIENTE y que Wompi aún no haya registrado.
create or replace function public.cancelar_pago(p_referencia text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.transacciones_pago
     set estado = 'CANCELADA', updated_at = now()
   where referencia = p_referencia
     and unidad_id = public.mi_unidad()
     and estado = 'PENDIENTE'
     and wompi_id is null;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.secreto_integridad_wompi(uuid) from public, anon, authenticated;
revoke execute on function public.pasarela_pagos() from public, anon, authenticated;
revoke execute on function public.iniciar_pago(text, numeric, text) from public, anon, authenticated;
revoke execute on function public.cancelar_pago(text) from public, anon, authenticated;

-- secreto_integridad_wompi no se concede a nadie: solo la usan las funciones de arriba.
grant execute on function public.pasarela_pagos() to authenticated;
grant execute on function public.iniciar_pago(text, numeric, text) to authenticated;
grant execute on function public.cancelar_pago(text) to authenticated;
