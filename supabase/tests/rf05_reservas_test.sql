-- =============================================================================================
-- Convive · Pruebas de base de datos de RF05 (reserva de zonas comunes) y RF06 (disponibilidad)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios, zonas y reservas de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF05 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Las fechas se calculan desde hoy en la hora de Colombia.
-- Requiere: 20261003000000_autenticacion.sql y 20261015000000_reservas.sql.
-- =============================================================================================

do $$
declare
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_dia date := (now() at time zone 'America/Bogota')::date + 5;
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_unidad_vecino uuid;
  v_residente uuid := gen_random_uuid();
  v_vecino uuid := gen_random_uuid();
  v_sin_unidad uuid := gen_random_uuid();
  v_cancha uuid;
  v_salon uuid;
  v_gimnasio uuid;
  v_inactiva uuid;
  v_zona_otro uuid;
  v_id uuid;
  v_estado public.estado_reserva;
  v_texto text;
  v_detalle text;
  v_cantidad integer;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero dos residentes con unidad y uno sin unidad
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF05', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF05', 'Cali') returning id into v_otro_conjunto;

  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF05-101') returning id into v_unidad;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF05-102') returning id into v_unidad_vecino;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, v_unidad, 'residente.rf05@convive.test', 'Residente RF05', 'residente'),
    (v_conjunto, v_unidad_vecino, 'vecino.rf05@convive.test', 'Vecino RF05', 'residente'),
    (v_conjunto, null, 'sinunidad.rf05@convive.test', 'Sin unidad RF05', 'vigilancia');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf05@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vecino, 'authenticated', 'authenticated', 'vecino.rf05@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_sin_unidad, 'authenticated', 'authenticated', 'sinunidad.rf05@convive.test');

  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo, requiere_aprobacion)
  values (v_conjunto, 'Cancha', '06:00', '22:00', 12, false) returning id into v_cancha;
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo, requiere_aprobacion)
  values (v_conjunto, 'Salón social', '08:00', '22:00', 50, true) returning id into v_salon;
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo, requiere_aprobacion)
  values (v_conjunto, 'Gimnasio', '00:00', '24:00', 5, false) returning id into v_gimnasio;
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo, activa)
  values (v_conjunto, 'Piscina', '08:00', '18:00', 30, false) returning id into v_inactiva;
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo)
  values (v_otro_conjunto, 'Cancha', '06:00', '22:00', 12) returning id into v_zona_otro;

  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------------------------------------
  -- RF05 · crear_reserva()
  -- ------------------------------------------------------------------------------------------

  -- 1 · Zona sin aprobación: queda confirmada, con la unidad y el perfil de la sesión.
  select r.id, r.estado, r.zona into v_id, v_estado, v_texto
    from public.crear_reserva(v_cancha, v_dia, '10:00', '12:00', 8) r;
  assert v_estado = 'confirmada', 'FALLÓ 1: la reserva de la cancha no quedó confirmada';
  assert v_texto = 'Cancha', 'FALLÓ 1: no devolvió el nombre de la zona';
  assert (select unidad_id from public.reservas where id = v_id) = v_unidad, 'FALLÓ 1: guardó otra unidad';
  assert (select conjunto_id from public.reservas where id = v_id) = v_conjunto, 'FALLÓ 1: guardó otro conjunto';
  assert (select p.user_id from public.reservas r join public.perfiles p on p.id = r.reservado_por where r.id = v_id) = v_residente,
    'FALLÓ 1: la auditoría no es de quien reservó';
  v_n := v_n + 1;

  -- 2 · Zona que requiere aprobación: queda pendiente (MSG-RF05-03).
  select r.estado into v_estado from public.crear_reserva(v_salon, v_dia, '18:00', '20:00') r;
  assert v_estado = 'pendiente', 'FALLÓ 2: la reserva del salón no quedó pendiente';
  v_n := v_n + 1;

  -- 3 · RF06: una franja que se cruza con otra reserva (de cualquier unidad) → sin_disponibilidad.
  perform set_config('request.jwt.claims', json_build_object('sub', v_vecino, 'role', 'authenticated')::text, true);
  begin
    perform public.crear_reserva(v_cancha, v_dia, '11:00', '13:00');
    raise exception 'FALLÓ 3: aceptó una franja ocupada';
  exception when others then
    if sqlerrm not like 'sin_disponibilidad%' then raise; end if;
  end;
  -- La pendiente también ocupa la franja.
  begin
    perform public.crear_reserva(v_salon, v_dia, '19:00', '21:00');
    raise exception 'FALLÓ 3: aceptó una franja ocupada por una reserva pendiente';
  exception when others then
    if sqlerrm not like 'sin_disponibilidad%' then raise; end if;
  end;
  -- Termina justo cuando empieza la otra: no se cruzan.
  perform public.crear_reserva(v_cancha, v_dia, '08:00', '10:00');
  v_n := v_n + 1;

  -- 4 · Una reserva cancelada o rechazada libera la franja.
  update public.reservas set estado = 'cancelada' where id = v_id;
  perform public.crear_reserva(v_cancha, v_dia, '10:00', '12:00');
  v_n := v_n + 1;

  -- 5 · Fecha desde hoy hasta el último día del tercer mes siguiente → fecha_invalida.
  begin
    perform public.crear_reserva(v_cancha, v_hoy - 1, '10:00', '11:00');
    raise exception 'FALLÓ 5: aceptó una fecha pasada';
  exception when others then
    if sqlerrm not like 'fecha_invalida%' then raise; end if;
  end;
  begin
    perform public.crear_reserva(v_cancha, (date_trunc('month', v_hoy) + interval '4 months')::date, '10:00', '11:00');
    raise exception 'FALLÓ 5: aceptó una fecha a más de 3 meses';
  exception when others then
    if sqlerrm not like 'fecha_invalida%' then raise; end if;
  end;
  perform public.crear_reserva(v_cancha, (date_trunc('month', v_hoy) + interval '4 months')::date - 1, '10:00', '11:00');
  v_n := v_n + 1;

  -- 6 · Hora fin posterior a la inicial y en bloques de 1 hora → horario_invalido (MSG-RF05-05).
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '12:00', '12:00');
    raise exception 'FALLÓ 6: aceptó hora fin igual a la inicial';
  exception when others then
    if sqlerrm not like 'horario_invalido%' then raise; end if;
  end;
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '14:00', '12:00');
    raise exception 'FALLÓ 6: aceptó hora fin antes de la inicial';
  exception when others then
    if sqlerrm not like 'horario_invalido%' then raise; end if;
  end;
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '10:30', '12:00');
    raise exception 'FALLÓ 6: aceptó una hora que no es un bloque de 1 hora';
  exception when others then
    if sqlerrm not like 'horario_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 7 · Fuera del horario de la zona → fuera_de_horario con el horario en el detalle (MSG-RF05-06).
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '05:00', '07:00');
    raise exception 'FALLÓ 7: aceptó una hora antes de la apertura';
  exception when others then
    if sqlerrm not like 'fuera_de_horario%' then raise; end if;
    get stacked diagnostics v_detalle = pg_exception_detail;
    assert v_detalle = '06:00|22:00', 'FALLÓ 7: el detalle no trae el horario: ' || coalesce(v_detalle, '(vacío)');
  end;
  begin
    perform public.crear_reserva(v_salon, v_dia + 1, '21:00', '23:00');
    raise exception 'FALLÓ 7: aceptó una hora después del cierre';
  exception when others then
    if sqlerrm not like 'fuera_de_horario%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 8 · Hoy no se puede reservar una franja que ya empezó → hora_pasada.
  begin
    perform public.crear_reserva(v_gimnasio, v_hoy, '00:00', '01:00');
    raise exception 'FALLÓ 8: aceptó una franja que ya empezó';
  exception when others then
    if sqlerrm not like 'hora_pasada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 9 · Asistentes entre 1 y el aforo → asistentes_invalidos o aforo_excedido (MSG-RF05-07).
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '10:00', '11:00', 0);
    raise exception 'FALLÓ 9: aceptó 0 asistentes';
  exception when others then
    if sqlerrm not like 'asistentes_invalidos%' then raise; end if;
  end;
  begin
    perform public.crear_reserva(v_cancha, v_dia + 1, '10:00', '11:00', 13);
    raise exception 'FALLÓ 9: aceptó más asistentes que el aforo';
  exception when others then
    if sqlerrm not like 'aforo_excedido%' then raise; end if;
    get stacked diagnostics v_detalle = pg_exception_detail;
    assert v_detalle = 'Cancha|12', 'FALLÓ 9: el detalle no trae la zona y el aforo: ' || coalesce(v_detalle, '(vacío)');
  end;
  perform public.crear_reserva(v_cancha, v_dia + 1, '10:00', '11:00', 12);
  v_n := v_n + 1;

  -- 10 · Zona inactiva o de otro conjunto → zona_invalida (MSG-RF05-04).
  begin
    perform public.crear_reserva(v_inactiva, v_dia, '10:00', '11:00');
    raise exception 'FALLÓ 10: aceptó una zona inactiva';
  exception when others then
    if sqlerrm not like 'zona_invalida%' then raise; end if;
  end;
  begin
    perform public.crear_reserva(v_zona_otro, v_dia, '10:00', '11:00');
    raise exception 'FALLÓ 10: aceptó una zona de otro conjunto';
  exception when others then
    if sqlerrm not like 'zona_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 11 · Sin unidad asignada no se reserva → sin_permiso.
  perform set_config('request.jwt.claims', json_build_object('sub', v_sin_unidad, 'role', 'authenticated')::text, true);
  begin
    perform public.crear_reserva(v_cancha, v_dia + 2, '10:00', '11:00');
    raise exception 'FALLÓ 11: reservó una cuenta sin unidad';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF05 · disponibilidad_zona()
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);

  -- 12 · Devuelve las franjas confirmadas y pendientes del rango, sin las canceladas.
  select count(*) into v_cantidad from public.disponibilidad_zona(v_cancha, v_dia, v_dia);
  assert v_cantidad = 2, 'FALLÓ 12: se esperaban 2 franjas ocupadas en la cancha y hay ' || v_cantidad;
  -- Ese día la cancha tiene 3 reservas guardadas: 08–10, 10–12 y la 10–12 cancelada (prueba 4).
  assert (select count(*) from public.reservas where zona_id = v_cancha and fecha = v_dia) = 3,
    'FALLÓ 12: no están las 3 reservas de la cancha';
  select count(*) into v_cantidad from public.disponibilidad_zona(v_salon, v_dia, v_dia);
  assert v_cantidad = 1, 'FALLÓ 12: la reserva pendiente del salón no aparece como ocupada';
  select count(*) into v_cantidad from public.disponibilidad_zona(v_cancha, v_dia + 30, v_dia + 30);
  assert v_cantidad = 0, 'FALLÓ 12: devolvió franjas fuera del rango';
  v_n := v_n + 1;

  -- 13 · Solo zonas del propio conjunto y un rango válido.
  begin
    perform public.disponibilidad_zona(v_zona_otro, v_dia, v_dia);
    raise exception 'FALLÓ 13: consultó una zona de otro conjunto';
  exception when others then
    if sqlerrm not like 'zona_invalida%' then raise; end if;
  end;
  begin
    perform public.disponibilidad_zona(v_cancha, v_dia, v_dia - 1);
    raise exception 'FALLÓ 13: aceptó un rango invertido';
  exception when others then
    if sqlerrm not like 'rango_invalido%' then raise; end if;
  end;
  begin
    perform public.disponibilidad_zona(v_cancha, v_hoy, v_hoy + 200);
    raise exception 'FALLÓ 13: aceptó un rango de más de 4 meses';
  exception when others then
    if sqlerrm not like 'rango_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 14 · Las tablas tienen Row Level Security y no aceptan escrituras directas desde la app.
  assert (select relrowsecurity from pg_class where oid = 'public.zonas_comunes'::regclass),
    'FALLÓ 14: zonas_comunes sin RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.reservas'::regclass),
    'FALLÓ 14: reservas sin RLS';
  assert not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('zonas_comunes', 'reservas') and cmd <> 'SELECT'
  ), 'FALLÓ 14: hay políticas de escritura directa';
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF05 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
