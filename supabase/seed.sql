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
