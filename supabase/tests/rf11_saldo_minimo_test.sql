-- =============================================================================================
-- Convive · Pruebas de base de datos de la corrección de RF11 (ningún saldo imposible de pagar)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) el conjunto, las llaves y los pagos de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF11 OK: 4 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: las migraciones de RF11, RF12 y RF15, y 20261201000000_saldo_minimo_pago.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_unidad uuid;
  v_residente uuid := gen_random_uuid();
  v_n integer := 0;
  v_referencia text;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF11', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'R11') returning id into v_unidad;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol)
  values (v_conjunto, v_unidad, 'residente.rf11@convive.test', 'Residente RF11', 'residente');
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf11@convive.test');
  perform public.configurar_wompi(v_conjunto, 'sandbox', 'pub_test_rf11', 'prv_test_rf11', 'test_events_rf11', 'test_integrity_rf11');
  -- Administración $ 35.000; extraordinaria $ 2.000; otros conceptos $ 500.
  insert into public.cartera (unidad_id, concepto_id, saldo) values
    (v_unidad, 'administracion', 35000),
    (v_unidad, 'extraordinaria', 2000),
    (v_unidad, 'otros', 500);
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);

  -- 1 · Un abono no puede dejar menos de $ 1.500 pendientes ($ 35.000 − $ 34.000 = $ 1.000)
  begin
    perform public.iniciar_pago('administracion', 34000);
    raise exception 'FALLÓ 1: aceptó un abono que deja $ 1.000 pendientes';
  exception when others then
    if sqlerrm <> 'abono_deja_saldo_menor_minimo' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 2 · Con $ 2.000 de saldo no hay abono posible: $ 1.500 se rechaza y el total sí se acepta
  begin
    perform public.iniciar_pago('extraordinaria', 1500);
    raise exception 'FALLÓ 2: aceptó un abono de $ 1.500 sobre un saldo de $ 2.000';
  exception when others then
    if sqlerrm <> 'abono_deja_saldo_menor_minimo' then raise; end if;
  end;
  select referencia into v_referencia from public.iniciar_pago('extraordinaria', 2000);
  if v_referencia is null then
    raise exception 'FALLÓ 2: no aceptó el pago total de $ 2.000';
  end if;
  v_n := v_n + 1;

  -- 3 · Un saldo menor a $ 1.500 no se paga en línea (se paga en la administración)
  begin
    perform public.iniciar_pago('otros', 1500, 'Parqueadero de visitantes');
    raise exception 'FALLÓ 3: aceptó pagar en línea un saldo de $ 500';
  exception when others then
    if sqlerrm <> 'saldo_menor_minimo' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 4 · Un abono que deja $ 1.500 o más sigue permitido ($ 35.000 − $ 33.500 = $ 1.500)
  select referencia into v_referencia from public.iniciar_pago('administracion', 33500);
  if v_referencia is null then
    raise exception 'FALLÓ 4: no aceptó un abono que deja $ 1.500 pendientes';
  end if;
  v_n := v_n + 1;

  raise exception 'RF11 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
