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

-- ---------------------------------------------------------------------------------------------
-- RF03 / RF04 · Movimientos de ejemplo (requiere 20261012000000_finanzas.sql)
-- Los mismos 13 movimientos de julio a octubre de 2026 del modo simulado (finance.mock.ts), para
-- que los reportes tengan datos que filtrar. Los registra la administración (admin@convive.com).
-- Se puede repetir sin duplicar.
-- ---------------------------------------------------------------------------------------------

insert into public.movimientos (conjunto_id, tipo, categoria_id, monto, fecha, descripcion, registrado_por, created_at)
select c.id, m.tipo::public.tipo_movimiento, m.categoria_id, m.monto, m.fecha::date, m.descripcion, p.id,
       (m.fecha || ' 09:00')::timestamp at time zone 'America/Bogota'
  from (values
         ('ingreso', 'ing-admin', 8250000.00, '2026-07-05', 'Recaudo cuotas de administración julio'),
         ('egreso', 'egr-servicios', 980000.00, '2026-07-18', 'Energía y acueducto de zonas comunes'),
         ('egreso', 'egr-nomina', 3200000.00, '2026-07-30', 'Nómina de julio del personal de aseo y portería'),
         ('ingreso', 'ing-admin', 8300000.00, '2026-08-05', 'Recaudo cuotas de administración agosto'),
         ('ingreso', 'ing-zonas', 450000.00, '2026-08-16', 'Alquiler del salón social'),
         ('egreso', 'egr-nomina', 3200000.00, '2026-08-30', 'Nómina de agosto del personal de aseo y portería'),
         ('egreso', 'egr-vigilancia', 2100000.00, '2026-08-31', 'Servicio de vigilancia de agosto'),
         ('ingreso', 'ing-admin', 8400000.00, '2026-09-05', 'Recaudo cuotas de administración septiembre'),
         ('egreso', 'egr-mantenimiento', 1250000.00, '2026-09-12', 'Mantenimiento preventivo del ascensor'),
         ('ingreso', 'ing-multas', 180000.00, '2026-09-20', 'Intereses de mora de septiembre'),
         ('egreso', 'egr-nomina', 3200000.00, '2026-09-30', 'Nómina de septiembre del personal de aseo y portería'),
         ('ingreso', 'ing-admin', 2150000.00, '2026-10-01', 'Recaudo parcial cuotas de administración octubre'),
         ('egreso', 'egr-aseo', 320000.00, '2026-10-01', 'Insumos de limpieza para zonas comunes')
       ) as m (tipo, categoria_id, monto, fecha, descripcion)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
  join public.perfiles p on p.email = 'admin@convive.com'
 where not exists (
   select 1 from public.movimientos x
    where x.conjunto_id = c.id and x.fecha = m.fecha::date and x.descripcion = m.descripcion
 );

-- ---------------------------------------------------------------------------------------------
-- RF05 · Zonas comunes y reservas de ejemplo (requiere 20261015000000_reservas.sql)
-- Las mismas zonas del modo simulado (reservations.mock.ts). El Salón social requiere aprobación.
-- Reservas de la casa 56 contadas desde hoy: la Cancha queda sin cupo dentro de 3 días (torneo).
-- Se puede repetir sin duplicar.
-- ---------------------------------------------------------------------------------------------

insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo, requiere_aprobacion, orden)
select c.id, z.nombre, z.apertura::time, z.cierre::time, z.aforo, z.aprobacion, z.orden
  from (values
         ('Salón social', '08:00', '22:00', 50, true, 1),
         ('Cancha', '06:00', '22:00', 12, false, 2),
         ('BBQ', '10:00', '20:00', 20, false, 3)
       ) as z (nombre, apertura, cierre, aforo, aprobacion, orden)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
on conflict (conjunto_id, nombre) do update
  set hora_apertura = excluded.hora_apertura, hora_cierre = excluded.hora_cierre, aforo = excluded.aforo,
      requiere_aprobacion = excluded.requiere_aprobacion, orden = excluded.orden;

insert into public.reservas (conjunto_id, zona_id, unidad_id, reservado_por, fecha, hora_inicio, hora_fin, estado)
select c.id, z.id, u.id, p.id, (now() at time zone 'America/Bogota')::date + r.dias, r.inicio::time, r.fin::time,
       case when z.requiere_aprobacion then 'pendiente' else 'confirmada' end::public.estado_reserva
  from (values
         ('Cancha', 1, '08:00', '10:00'),
         ('Cancha', 3, '06:00', '22:00'),
         ('BBQ', 1, '12:00', '16:00'),
         ('Salón social', 2, '18:00', '22:00')
       ) as r (zona, dias, inicio, fin)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
  join public.zonas_comunes z on z.conjunto_id = c.id and z.nombre = r.zona
  join public.unidades u on u.conjunto_id = c.id and u.nombre = '56'
  join public.perfiles p on p.email = 'monica@gmail.com'
 where not exists (
   select 1 from public.reservas x
    where x.zona_id = z.id
      and x.fecha = (now() at time zone 'America/Bogota')::date + r.dias
      and x.hora_inicio = r.inicio::time
 );
-- ---------------------------------------------------------------------------------------------
-- RF07 · PQRS de ejemplo (requiere 20261022000000_pqrs.sql)
-- Las mismas del modo simulado (pqrs.mock.ts): tres PQRS de la casa 56 (monica@gmail.com), una
-- resuelta y otra en proceso con respuestas de la administración, y un reporte de daño pendiente.
-- La siguiente que se radique en el conjunto será la #0004. Se puede repetir sin duplicar.
-- ---------------------------------------------------------------------------------------------

insert into public.pqrs (conjunto_id, radicado, radicado_por, unidad_id, tipo, descripcion, estado, created_at, updated_at)
select c.id, q.radicado, p.id, p.unidad_id, q.tipo::public.tipo_pqrs, q.descripcion, q.estado::public.estado_pqrs,
       q.creada::timestamptz, q.creada::timestamptz
  from (values
         (1, 'reclamo', 'Fuga de agua en el techo del parqueadero, frente a la casa 56.', 'resuelto', '2026-08-20 09:10-05'),
         (2, 'queja', 'Ruido de música después de las 11 p. m. en la torre 4 casi todos los fines de semana.', 'en_proceso', '2026-09-17 21:40-05'),
         (3, 'reporte_dano', 'El portón vehicular no cierra completamente y queda abierto unos centímetros.', 'pendiente', '2026-10-05 07:15-05')
       ) as q (radicado, tipo, descripcion, estado, creada)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
  join public.perfiles p on p.email = 'monica@gmail.com'
on conflict (conjunto_id, radicado) do nothing;

insert into public.pqrs_respuestas (pqrs_id, autor_id, mensaje, estado, created_at)
select q.id, a.id, r.mensaje, r.estado::public.estado_pqrs, r.creada::timestamptz
  from (values
         (1, 'Recibimos tu reclamo. El plomero revisa la fuga el viernes.', 'en_proceso', '2026-08-21 10:00-05'),
         (1, 'Se cambió el tubo dañado y se selló el techo. Gracias por avisar.', 'resuelto', '2026-08-23 12:30-05'),
         (2, 'Enviamos un llamado de atención a la unidad y la vigilancia hará rondas los sábados.', 'en_proceso', '2026-09-19 08:00-05')
       ) as r (radicado, mensaje, estado, creada)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
  join public.pqrs q on q.conjunto_id = c.id and q.radicado = r.radicado
  join public.perfiles a on a.email = 'admin@convive.com'
 where not exists (
   select 1 from public.pqrs_respuestas x where x.pqrs_id = q.id and x.mensaje = r.mensaje
 );

-- ---------------------------------------------------------------------------------------------
-- RF10 · Visitas de ejemplo (requiere 20261030000000_visitantes.sql)
-- Las mismas del modo simulado (visitors.mock.ts), registradas por la portería
-- (vigilancia@convive.com): Ana María Restrepo (CC 1012345678) ya salió de la casa 56, así que al
-- escribir su documento se autocompleta el nombre; Carlos Mejía (CC 79876543) sigue dentro con el
-- carro ABC123 en la casa 12. Se puede repetir sin duplicar.
-- ---------------------------------------------------------------------------------------------

insert into public.visitas (conjunto_id, nombre, tipo_documento, numero_documento, unidad_id, placa, entrada, salida, entrada_por, salida_por)
select c.id, v.nombre, 'CC'::public.tipo_documento, v.documento, u.id, v.placa, v.entrada::timestamptz, v.salida::timestamptz, g.id,
       case when v.salida is not null then g.id end
  from (values
         ('Ana María Restrepo', '1012345678', '56', null, '2026-10-28 10:00-05', '2026-10-28 12:30-05'),
         ('Carlos Mejía', '79876543', '12', 'ABC123', '2026-10-29 08:20-05', null)
       ) as v (nombre, documento, unidad, placa, entrada, salida)
  join public.conjuntos c on c.nombre = 'Conjunto Residencial Convive'
  join public.unidades u on u.conjunto_id = c.id and u.nombre = v.unidad
  join public.perfiles g on g.email = 'vigilancia@convive.com'
 where not exists (
   select 1 from public.visitas x
    where x.conjunto_id = c.id and x.numero_documento = v.documento and x.entrada = v.entrada::timestamptz
 );
