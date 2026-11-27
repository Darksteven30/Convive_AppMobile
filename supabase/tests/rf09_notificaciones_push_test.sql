-- =============================================================================================
-- Convive · Pruebas de base de datos del RF09 (notificaciones push)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos ni envían push: todo corre dentro de un bloque que termina con un error a
-- propósito, así PostgreSQL deshace (rollback) todo, incluidas las solicitudes de pg_net, que
-- solo se envían cuando se confirman.
--   · Si todo pasa, el resultado es el «error»:  RF09 OK: 9 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: las migraciones de autenticación, pagos, reservas, PQRS y 20261127000000_notificaciones_push.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_unidad uuid;
  v_zona uuid;
  v_residente uuid := gen_random_uuid();
  v_vecino uuid := gen_random_uuid();
  v_perfil uuid;
  v_perfil_vecino uuid;
  v_tx uuid;
  v_reserva uuid;
  v_token text := 'ExponentPushToken[prueba-rf09-123]';
  v_n integer := 0;
  v_cantidad integer;
  v_texto text;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF09', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF09-101') returning id into v_unidad;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, v_unidad, 'residente.rf09@convive.test', 'Residente RF09', 'residente'),
    (v_conjunto, v_unidad, 'vecino.rf09@convive.test', 'Vecino RF09', 'residente');
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf09@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vecino, 'authenticated', 'authenticated', 'vecino.rf09@convive.test');
  select id into v_perfil from public.perfiles where user_id = v_residente;
  select id into v_perfil_vecino from public.perfiles where user_id = v_vecino;

  -- 1 · El residente registra su celular; un token con formato inválido se rechaza
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  perform public.registrar_dispositivo_push(v_token, 'android');
  if not exists (select 1 from public.dispositivos_push where token = v_token and perfil_id = v_perfil) then
    raise exception 'FALLÓ 1: no se registró el celular';
  end if;
  begin
    perform public.registrar_dispositivo_push('token-cualquiera', 'android');
    raise exception 'FALLÓ 1: aceptó un token inválido';
  exception when others then
    if sqlerrm <> 'token_invalido' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 2 · Una notificación nueva se envía como push una vez (queda marcada)
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
  values (v_perfil, 'noticia_nueva', 'Nuevo comunicado', 'Corte de agua el sábado', gen_random_uuid());
  if (select push_enviada_at from public.notificaciones where perfil_id = v_perfil and tipo = 'noticia_nueva') is null then
    raise exception 'FALLÓ 2: la notificación no quedó marcada como enviada';
  end if;
  v_n := v_n + 1;

  -- 3 · Sin celulares registrados no se intenta el envío
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje)
  values (v_perfil_vecino, 'noticia_nueva', 'Nuevo comunicado', 'Corte de agua el sábado');
  if (select push_enviada_at from public.notificaciones where perfil_id = v_perfil_vecino) is not null then
    raise exception 'FALLÓ 3: se marcó como enviada sin celulares';
  end if;
  v_n := v_n + 1;

  -- 4 · Si otra persona inicia sesión en el mismo celular, el celular pasa a ella
  perform set_config('request.jwt.claims', json_build_object('sub', v_vecino, 'role', 'authenticated')::text, true);
  perform public.registrar_dispositivo_push(v_token, 'android');
  if (select perfil_id from public.dispositivos_push where token = v_token) <> v_perfil_vecino then
    raise exception 'FALLÓ 4: el celular sigue a nombre de la persona anterior';
  end if;
  -- Y al cerrar sesión se elimina.
  perform public.eliminar_dispositivo_push(v_token);
  if exists (select 1 from public.dispositivos_push where token = v_token) then
    raise exception 'FALLÓ 4: el celular no se eliminó al cerrar sesión';
  end if;
  v_n := v_n + 1;

  -- 5 · Destino al tocar cada notificación
  if public.url_notificacion('pqrs_estado', '00000000-0000-0000-0000-000000000001') <> '/pqrs/00000000-0000-0000-0000-000000000001'
     or public.url_notificacion('reserva_confirmada', null) <> '/reservas'
     or public.url_notificacion('otro', null) <> '/inicio' then
    raise exception 'FALLÓ 5: url_notificacion no lleva a la pantalla esperada';
  end if;
  v_n := v_n + 1;

  -- 6 · Formato de moneda como en la app
  if public.formato_pesos(1250000) <> '$ 1.250.000,00' or public.formato_pesos(1500.5) <> '$ 1.500,50' then
    raise exception 'FALLÓ 6: formato_pesos devolvió % y %', public.formato_pesos(1250000), public.formato_pesos(1500.5);
  end if;
  v_n := v_n + 1;

  -- 7 · Un pago aprobado avisa a quien pagó, una sola vez, con el enlace a su comprobante
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'administracion', 45000, 4500000, 'CNV-RF09-PRUEBA-1', 'firma-de-prueba', v_perfil)
  returning id into v_tx;
  update public.transacciones_pago set estado = 'APROBADA' where id = v_tx;
  select mensaje into v_texto from public.notificaciones where perfil_id = v_perfil and tipo = 'pago_aprobado';
  if v_texto is null or v_texto not like 'Recibimos tu pago de $ 45.000,00 por %' then
    raise exception 'FALLÓ 7: aviso de pago aprobado: %', v_texto;
  end if;
  if public.url_notificacion('pago_aprobado', v_tx) <> '/pago/confirmacion?reference=CNV-RF09-PRUEBA-1' then
    raise exception 'FALLÓ 7: el aviso no lleva al comprobante';
  end if;
  -- Un segundo cambio a APROBADA (p. ej. un evento repetido de Wompi) no repite el aviso.
  update public.transacciones_pago set estado = 'PENDIENTE' where id = v_tx;
  update public.transacciones_pago set estado = 'APROBADA' where id = v_tx;
  select count(*) into v_cantidad from public.notificaciones where perfil_id = v_perfil and tipo = 'pago_aprobado';
  if v_cantidad <> 1 then
    raise exception 'FALLÓ 7: el pago aprobado se avisó % veces', v_cantidad;
  end if;
  v_n := v_n + 1;

  -- 8 · Una reserva confirmada avisa a quien reservó; una pendiente no
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo)
  values (v_conjunto, 'BBQ RF09', '10:00', '20:00', 20) returning id into v_zona;
  insert into public.reservas (conjunto_id, zona_id, unidad_id, reservado_por, fecha, hora_inicio, hora_fin, estado)
  values (v_conjunto, v_zona, v_unidad, v_perfil, '2026-12-24', '12:00', '16:00', 'pendiente')
  returning id into v_reserva;
  if exists (select 1 from public.notificaciones where referencia_id = v_reserva) then
    raise exception 'FALLÓ 8: una reserva pendiente avisó como confirmada';
  end if;
  update public.reservas set estado = 'confirmada' where id = v_reserva;
  select mensaje into v_texto from public.notificaciones where referencia_id = v_reserva and tipo = 'reserva_confirmada';
  if v_texto is distinct from 'BBQ RF09 el 24/12 de 12:00 a 16:00.' then
    raise exception 'FALLÓ 8: aviso de reserva: %', v_texto;
  end if;
  v_n := v_n + 1;

  -- 9 · Nadie más puede registrar celulares a nombre de otro ni llamar las funciones internas
  if has_function_privilege('anon', 'public.registrar_dispositivo_push(text, text)', 'execute')
     or has_function_privilege('authenticated', 'public.notificar_una_vez(uuid, text, text, text, uuid)', 'execute') then
    raise exception 'FALLÓ 9: permisos de ejecución demasiado abiertos';
  end if;
  v_n := v_n + 1;

  raise exception 'RF09 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
