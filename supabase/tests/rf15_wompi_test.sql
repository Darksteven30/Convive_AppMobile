-- =============================================================================================
-- Convive · Pruebas de base de datos del RF15 (Integración y conciliación con Wompi)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) el conjunto, las llaves y los pagos de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF15 OK: 16 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- Requiere: las migraciones del RF11, RF12 y RF15.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_unidad uuid;
  v_perfil uuid;
  v_tx uuid;
  v_estado public.estado_transaccion;
  v_texto text;
  v_saldo numeric;
  v_n integer := 0;
  v_evento jsonb;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: un conjunto, una unidad con saldo y un perfil
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF15', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'T15') returning id into v_unidad;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol)
  values (v_conjunto, v_unidad, 'prueba.rf15@convive.test', 'Prueba RF15', 'residente') returning id into v_perfil;
  insert into public.cartera (unidad_id, concepto_id, saldo) values
    (v_unidad, 'administracion', 35000),
    (v_unidad, 'extraordinaria', 0);

  -- ------------------------------------------------------------------------------------------
  -- 1-3 · Llaves por conjunto y ambientes (no se pueden mezclar Sandbox y Producción)
  -- ------------------------------------------------------------------------------------------
  begin
    perform public.configurar_wompi(v_conjunto, 'sandbox', 'pub_prod_x', 'prv_test_x', 'test_events_x', 'test_integrity_x');
    raise exception 'FALLÓ 1: aceptó una llave pública de Producción en Sandbox';
  exception when others then
    if sqlerrm not like 'llaves_de_otro_ambiente%' then raise; end if;
  end;
  v_n := v_n + 1;

  begin
    perform public.configurar_wompi(v_conjunto, 'produccion', 'pub_prod_x', 'prv_test_x', 'prod_events_x', 'prod_integrity_x');
    raise exception 'FALLÓ 2: aceptó una llave privada de Sandbox en Producción';
  exception when others then
    if sqlerrm not like 'llaves_de_otro_ambiente%' then raise; end if;
  end;
  v_n := v_n + 1;

  perform public.configurar_wompi(v_conjunto, 'sandbox', 'pub_test_rf15', 'prv_test_rf15', 'test_events_rf15', 'test_integrity_rf15');
  assert (select llave_publica from public.wompi_conjuntos where conjunto_id = v_conjunto) = 'pub_test_rf15',
    'FALLÓ 3: la llave pública no quedó en wompi_conjuntos';
  assert public.secreto_wompi(v_conjunto, 'privada') = 'prv_test_rf15'
     and public.secreto_wompi(v_conjunto, 'eventos') = 'test_events_rf15'
     and public.secreto_wompi(v_conjunto, 'integridad') = 'test_integrity_rf15',
    'FALLÓ 3: las llaves secretas no quedaron en el Vault';
  v_n := v_n + 1;

  -- 4 · La llave pública debe coincidir con el ambiente del conjunto.
  begin
    update public.wompi_conjuntos set ambiente = 'produccion' where conjunto_id = v_conjunto;
    raise exception 'FALLÓ 4: permitió ambiente produccion con llave pub_test_';
  exception when check_violation then null;
  end;
  v_n := v_n + 1;

  -- 5 · Las Edge Functions obtienen las credenciales del conjunto a partir de la referencia.
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'administracion', 30000, 3000000, 'RF15-APROBADO', 'firma', v_perfil) returning id into v_tx;
  select llave_privada || '|' || secreto_eventos || '|' || ambiente into v_texto
    from public.credenciales_wompi('RF15-APROBADO');
  assert v_texto = 'prv_test_rf15|test_events_rf15|sandbox', 'FALLÓ 5: credenciales_wompi no devolvió las llaves del conjunto';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- 6-9 · Estado que reporta Wompi y saldo
  -- ------------------------------------------------------------------------------------------
  -- 6 · APPROVED descuenta el saldo del concepto.
  v_estado := public.aplicar_estado_wompi('RF15-APROBADO', 'w-1', 'APPROVED', 'CARD');
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'administracion';
  assert v_estado = 'APROBADA' and v_saldo = 5000, format('FALLÓ 6: esperaba APROBADA y saldo 5000, quedó %s y %s', v_estado, v_saldo);
  assert (select wompi_id || '|' || medio_pago || '|' || monto_aplicado from public.transacciones_pago where id = v_tx) = 'w-1|CARD|30000.00',
    'FALLÓ 6: no guardó el ID de Wompi, el medio o el monto aplicado';
  v_n := v_n + 1;

  -- 7 · Idempotente: aprobar otra vez no vuelve a descontar, y un PENDING tardío no lo regresa a PENDIENTE.
  perform public.aplicar_estado_wompi('RF15-APROBADO', 'w-1', 'APPROVED', 'CARD');
  v_estado := public.aplicar_estado_wompi('RF15-APROBADO', 'w-1', 'PENDING', 'CARD');
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'administracion';
  assert v_estado = 'APROBADA' and v_saldo = 5000, format('FALLÓ 7: quedó %s con saldo %s', v_estado, v_saldo);
  v_n := v_n + 1;

  -- 8 · VOIDED (anulado) devuelve exactamente lo descontado.
  v_estado := public.aplicar_estado_wompi('RF15-APROBADO', 'w-1', 'VOIDED', 'CARD');
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'administracion';
  assert v_estado = 'ANULADA' and v_saldo = 35000, format('FALLÓ 8: esperaba ANULADA y saldo 35000, quedó %s y %s', v_estado, v_saldo);
  v_n := v_n + 1;

  -- 9 · Un pago aprobado sin saldo pendiente (cuota extra) no deja el saldo en negativo.
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'extraordinaria', 50000, 5000000, 'RF15-EXTRA', 'firma', v_perfil);
  perform public.aplicar_estado_wompi('RF15-EXTRA', 'w-2', 'APPROVED', 'NEQUI');
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'extraordinaria';
  assert v_saldo = 0, format('FALLÓ 9: el saldo quedó en %s', v_saldo);
  v_n := v_n + 1;

  -- 10 · DECLINED no toca el saldo.
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'administracion', 1000, 100000, 'RF15-RECHAZADO', 'firma', v_perfil);
  v_estado := public.aplicar_estado_wompi('RF15-RECHAZADO', 'w-3', 'DECLINED', 'CARD');
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'administracion';
  assert v_estado = 'RECHAZADA' and v_saldo = 35000, format('FALLÓ 10: quedó %s con saldo %s', v_estado, v_saldo);
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- 11-12 · Webhook idempotente
  -- ------------------------------------------------------------------------------------------
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'administracion', 2000, 200000, 'RF15-EVENTO', 'firma', v_perfil);
  v_evento := jsonb_build_object(
    'event', 'transaction.updated',
    'data', jsonb_build_object('transaction', jsonb_build_object(
      'id', 'w-4', 'reference', 'RF15-EVENTO', 'status', 'APPROVED', 'payment_method_type', 'PSE')),
    'timestamp', 1);
  v_texto := public.procesar_evento_wompi('CHECKSUM-RF15', v_evento);
  assert v_texto = 'APROBADA', format('FALLÓ 11: el evento devolvió %s', v_texto);
  -- El mismo evento otra vez (mismo checksum, aunque llegue en minúsculas) no se aplica de nuevo.
  v_texto := public.procesar_evento_wompi('checksum-rf15', v_evento);
  select saldo into v_saldo from public.cartera where unidad_id = v_unidad and concepto_id = 'administracion';
  assert v_texto = 'duplicado' and v_saldo = 33000, format('FALLÓ 11: esperaba duplicado y saldo 33000, quedó %s y %s', v_texto, v_saldo);
  assert (select count(*) from public.eventos_wompi where checksum = 'CHECKSUM-RF15') = 1, 'FALLÓ 11: guardó el evento dos veces';
  v_n := v_n + 1;

  v_texto := public.procesar_evento_wompi('CHECKSUM-AJENO', jsonb_build_object(
    'event', 'transaction.updated',
    'data', jsonb_build_object('transaction', jsonb_build_object('id', 'w-5', 'reference', 'NO-ES-DE-CONVIVE', 'status', 'APPROVED'))));
  assert v_texto = 'desconocido', format('FALLÓ 12: una referencia ajena devolvió %s', v_texto);
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- 13-16 · Conciliación y un solo pago pendiente por concepto
  -- ------------------------------------------------------------------------------------------
  -- 13 · Solo concilia los PENDIENTES de más de 30 minutos.
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por, created_at)
  values (v_unidad, 'administracion', 1000, 100000, 'RF15-VIEJO', 'firma', v_perfil, now() - interval '40 minutes');
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por, created_at)
  values (v_unidad, 'extraordinaria', 1000, 100000, 'RF15-RECIENTE', 'firma', v_perfil, now() - interval '10 minutes');
  assert exists (select 1 from public.pendientes_por_conciliar(30) where referencia = 'RF15-VIEJO')
     and not exists (select 1 from public.pendientes_por_conciliar(30) where referencia = 'RF15-RECIENTE'),
    'FALLÓ 13: pendientes_por_conciliar no filtró por los 30 minutos';
  v_n := v_n + 1;

  -- 14 · No se permite un segundo pago PENDIENTE del mismo concepto (índice único).
  begin
    insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
    values (v_unidad, 'administracion', 1000, 100000, 'RF15-SEGUNDO', 'firma', v_perfil);
    raise exception 'FALLÓ 14: permitió dos pagos PENDIENTES del mismo concepto';
  exception when unique_violation then null;
  end;
  v_n := v_n + 1;

  -- 15 · El pago abandonado (nunca llegó a Wompi) se cancela y desbloquea el concepto.
  perform public.cancelar_pago_abandonado('RF15-VIEJO');
  assert (select estado from public.transacciones_pago where referencia = 'RF15-VIEJO') = 'CANCELADA',
    'FALLÓ 15: no canceló el pago abandonado';
  insert into public.transacciones_pago (unidad_id, concepto_id, monto, monto_centavos, referencia, firma, creada_por)
  values (v_unidad, 'administracion', 1000, 100000, 'RF15-NUEVO', 'firma', v_perfil);
  v_n := v_n + 1;

  -- 16 · No cancela un pago que Wompi ya registró (tiene wompi_id), aunque siga pendiente.
  update public.transacciones_pago set wompi_id = 'w-6' where referencia = 'RF15-NUEVO';
  perform public.cancelar_pago_abandonado('RF15-NUEVO');
  assert (select estado from public.transacciones_pago where referencia = 'RF15-NUEVO') = 'PENDIENTE',
    'FALLÓ 16: canceló un pago que Wompi ya tenía';
  v_n := v_n + 1;

  -- La tarea programada existe y corre cada 15 minutos.
  assert exists (select 1 from cron.job where jobname = 'conciliar-pagos-wompi' and schedule = '*/15 * * * *' and active),
    'FALLÓ: no existe la tarea conciliar-pagos-wompi cada 15 minutos';

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF15 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
