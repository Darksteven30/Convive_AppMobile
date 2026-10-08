-- =============================================================================================
-- Convive · Datos de prueba
--
-- Crea un conjunto con sus unidades y pre-registra las mismas cuentas que usaba el servicio
-- simulado. Todas quedan «pre-registradas»: la primera vez, cada persona entra con su correo y
-- la app le pide crear su contraseña (RF01). Para que coincidan con el README, usen:
--   admin@convive.com → Admin123 · junta@convive.com → Junta123
--   monica@gmail.com → Residente123 · vigilancia@convive.com → Vigilancia123
--   nuevo@convive.com → se deja sin contraseña para probar «Crea tu contraseña»
--
-- Cómo aplicarlo: después de la migración, pegar este archivo en el SQL Editor → Run.
-- =============================================================================================

with conjunto as (
  insert into public.conjuntos (nombre, ciudad)
  values ('Conjunto Residencial Convive', 'Cali')
  returning id
),
unidades as (
  insert into public.unidades (conjunto_id, nombre, direccion)
  select conjunto.id, u.nombre, u.direccion
    from conjunto,
         (values
           ('56', 'Casa # 56 Cali - Valle'),
           ('12', 'Casa # 12 Cali - Valle'),
           ('78', 'Casa # 78 Cali - Valle'),
           ('Administración', 'Oficina de administración'),
           ('Portería', 'Portería principal')
         ) as u (nombre, direccion)
  returning id, conjunto_id, nombre
)
insert into public.perfiles (conjunto_id, unidad_id, email, nombre, telefono, rol)
select un.conjunto_id, un.id, p.email, p.nombre, p.telefono, p.rol::public.rol
  from (values
         ('56', 'monica@gmail.com', 'Monica Galvis', '3111234567', 'residente'),
         ('Administración', 'admin@convive.com', 'David Muñoz', '3007654321', 'administrador'),
         ('12', 'junta@convive.com', 'Carlos Rojas', '3152223344', 'junta_directiva'),
         ('Portería', 'vigilancia@convive.com', 'Jorge Pérez', '3185556677', 'vigilancia'),
         ('78', 'nuevo@convive.com', 'Laura Gómez', '3129876543', 'residente')
       ) as p (unidad, email, nombre, telefono, rol)
  join unidades un on un.nombre = p.unidad;

-- ---------------------------------------------------------------------------------------------
-- RF11 · Saldos pendientes por concepto (requiere 20261004000000_seleccion_concepto_pago.sql)
-- Si ya aplicaron lo de arriba, basta con ejecutar este bloque; se puede repetir sin duplicar.
--   Casa 56 (monica) → $ 45.678,90: administración, otros y la extraordinaria sin saldo.
--   Casa 12 (junta) y Casa 78 (nuevo) → solo administración. Administración y Portería → al día.
-- ---------------------------------------------------------------------------------------------

insert into public.cartera (unidad_id, concepto_id, saldo)
select u.id, s.concepto_id, s.saldo
  from (values
         ('56', 'administracion', 35000.00),
         ('56', 'extraordinaria', 0.00),
         ('56', 'otros', 10678.90),
         ('12', 'administracion', 35000.00),
         ('78', 'administracion', 70000.00)
       ) as s (unidad, concepto_id, saldo)
  join public.unidades u on u.nombre = s.unidad
  join public.conjuntos c on c.id = u.conjunto_id and c.nombre = 'Conjunto Residencial Convive'
on conflict (unidad_id, concepto_id) do update set saldo = excluded.saldo, updated_at = now();

-- ---------------------------------------------------------------------------------------------
-- RF12 · Cuenta Wompi del conjunto (requiere 20261005000000_pago_wompi.sql)
-- Deja los medios habilitados. Para pagar falta poner la llave pública de Sandbox y guardar el
-- secreto de integridad en el Vault (ver README → «Wompi»); sin eso el pago muestra MSG-RF12-04.
-- ---------------------------------------------------------------------------------------------

insert into public.wompi_conjuntos (conjunto_id, ambiente, medios_habilitados)
select c.id, 'sandbox', array['CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA']
  from public.conjuntos c
 where c.nombre = 'Conjunto Residencial Convive'
on conflict (conjunto_id) do nothing;

-- ---------------------------------------------------------------------------------------------
-- RF02 · Historial de pagos de ejemplo (requiere 20261005000000_pago_wompi.sql)
-- Casa 56 (monica): la cuota de administración de los últimos 16 meses, una cuota extraordinaria
-- y dos pagos de «Otros conceptos», todos APROBADOS. Son pagos de meses anteriores: no cambian la
-- cartera de arriba. Las fechas se calculan desde hoy, así que el filtro por defecto (últimos 12
-- meses) siempre muestra más de 12 pagos y aparece «Ver más». Se puede repetir sin duplicar.
-- ---------------------------------------------------------------------------------------------

with base as (
  select date_trunc('month', now() at time zone 'America/Bogota') as mes
),
historial (concepto_id, descripcion, monto, meses, dia, sufijo, medio) as (
  select 'administracion', null::text, 35000.00::numeric(18, 2), n, interval '4 days 10 hours', 'ADM',
         (array['NEQUI', 'CARD', 'PSE', 'DAVIPLATA'])[1 + n % 4]
    from generate_series(1, 16) as n
  union all
  values
    ('extraordinaria', null, 120000.00, 7, interval '14 days 15 hours', 'EXT', 'PSE'),
    ('otros', 'Parqueadero de visitantes', 15000.00, 3, interval '19 days 9 hours', 'OTR', 'NEQUI'),
    ('otros', 'Copia de la llave de la piscina', 8500.00, 1, interval '11 days 17 hours', 'LLV', 'CARD')
),
pagos as (
  select h.*,
         (base.mes - make_interval(months => h.meses) + h.dia) at time zone 'America/Bogota' as fecha,
         to_char(base.mes - make_interval(months => h.meses), 'YYYYMM') || '-' || h.sufijo as codigo
    from historial h, base
)
insert into public.transacciones_pago
  (unidad_id, concepto_id, descripcion, monto, monto_centavos, moneda, referencia, firma, estado,
   wompi_id, medio_pago, creada_por, created_at, updated_at)
select u.id, pg.concepto_id, pg.descripcion, pg.monto, (pg.monto * 100)::bigint, 'COP',
       'CNV-56-SEED-' || pg.codigo, 'seed', 'APROBADA', 'seed-56-' || pg.codigo, pg.medio, p.id,
       pg.fecha, pg.fecha
  from pagos pg
  join public.unidades u on u.nombre = '56'
  join public.conjuntos c on c.id = u.conjunto_id and c.nombre = 'Conjunto Residencial Convive'
  join public.perfiles p on p.email = 'monica@gmail.com'
on conflict (referencia) do nothing;
