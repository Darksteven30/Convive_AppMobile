-- =============================================================================================
-- Convive · Pruebas de base de datos del RF09, parte 2 (aviso «Tu pago vence pronto»)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos ni envían push: todo corre dentro de un bloque que termina con un error a
-- propósito, así PostgreSQL deshace (rollback) todo.
--   · Si todo pasa, el resultado es el «error»:  RF09 OK: 7 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261127000000_notificaciones_push.sql y 20261128000000_pago_por_vencer.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_con_deuda uuid;
  v_al_dia uuid;
  v_admin uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_perfil uuid;
  v_perfil_al_dia uuid;
  v_n integer := 0;
  v_cantidad integer;
  v_texto text;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF09-2', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF09-201') returning id into v_con_deuda;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF09-202') returning id into v_al_dia;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'admin.rf09b@convive.test', 'Admin RF09-2', 'administrador'),
    (v_conjunto, v_con_deuda, 'residente.rf09b@convive.test', 'Residente RF09-2', 'residente'),
    (v_conjunto, v_al_dia, 'aldia.rf09b@convive.test', 'Al día RF09-2', 'residente');
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf09b@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf09b@convive.test');
  select id into v_perfil from public.perfiles where email = 'residente.rf09b@convive.test';
  select id into v_perfil_al_dia from public.perfiles where email = 'aldia.rf09b@convive.test';
  -- La unidad 201 debe dos conceptos; la 202 está al día.
  insert into public.cartera (unidad_id, concepto_id, saldo) values
    (v_con_deuda, 'administracion', 300000),
    (v_con_deuda, 'extraordinaria', 50000),
    (v_al_dia, 'administracion', 0);

  -- 1 · Solo el administrador define el día de vencimiento, y solo del 1 al 28
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  begin
    perform public.configurar_dia_vencimiento(10);
    raise exception 'FALLÓ 1: un residente cambió el día de vencimiento';
  exception when others then
    if sqlerrm <> 'sin_permiso' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.configurar_dia_vencimiento(31);
    raise exception 'FALLÓ 1: aceptó el día 31';
  exception when others then
    if sqlerrm <> 'dia_invalido' then raise; end if;
  end;
  if public.configurar_dia_vencimiento(10) <> 10 or public.dia_vencimiento_conjunto() <> 10 then
    raise exception 'FALLÓ 1: no se guardó el día 10';
  end if;
  v_n := v_n + 1;

  -- 2 · 5 días antes avisa a quien debe, con el saldo total y la fecha
  v_cantidad := public.avisar_pagos_por_vencer('2026-12-05');
  select mensaje into v_texto from public.notificaciones
   where perfil_id = v_perfil and tipo = 'pago_por_vencer' and titulo = 'Tu pago vence pronto';
  if v_texto is distinct from 'Tu saldo pendiente de $ 350.000,00 vence el 10/12.' then
    raise exception 'FALLÓ 2: aviso de 5 días antes: %', v_texto;
  end if;
  v_n := v_n + 1;

  -- 3 · Quien está al día no recibe aviso
  if exists (select 1 from public.notificaciones where perfil_id = v_perfil_al_dia and tipo = 'pago_por_vencer') then
    raise exception 'FALLÓ 3: avisó a una unidad sin saldo pendiente';
  end if;
  v_n := v_n + 1;

  -- 4 · Si la tarea corre dos veces el mismo día no repite el aviso
  if public.avisar_pagos_por_vencer('2026-12-05') <> 0 then
    raise exception 'FALLÓ 4: repitió el aviso el mismo día';
  end if;
  v_n := v_n + 1;

  -- 5 · El día del vencimiento avisa «vence hoy»; otros días no avisa
  if public.avisar_pagos_por_vencer('2026-12-07') <> 0 then
    raise exception 'FALLÓ 5: avisó un día que no corresponde';
  end if;
  perform public.avisar_pagos_por_vencer('2026-12-10');
  select mensaje into v_texto from public.notificaciones
   where perfil_id = v_perfil and tipo = 'pago_por_vencer' and titulo = 'Tu pago vence hoy';
  if v_texto is distinct from 'Hoy vence tu saldo pendiente de $ 350.000,00.' then
    raise exception 'FALLÓ 5: aviso del día del vencimiento: %', v_texto;
  end if;
  v_n := v_n + 1;

  -- 6 · Si el vencimiento cae a inicio de mes, el aviso de 5 días antes llega a final del anterior;
  --     y sin día de vencimiento no hay avisos
  perform public.configurar_dia_vencimiento(2);
  delete from public.notificaciones where perfil_id = v_perfil;
  perform public.avisar_pagos_por_vencer('2026-12-28');
  select mensaje into v_texto from public.notificaciones where perfil_id = v_perfil and tipo = 'pago_por_vencer';
  if v_texto is distinct from 'Tu saldo pendiente de $ 350.000,00 vence el 02/01.' then
    raise exception 'FALLÓ 6: aviso de fin de mes: %', v_texto;
  end if;
  perform public.configurar_dia_vencimiento(null);
  delete from public.notificaciones where perfil_id = v_perfil;
  if public.avisar_pagos_por_vencer('2027-01-02') <> 0 then
    raise exception 'FALLÓ 6: avisó sin día de vencimiento';
  end if;
  v_n := v_n + 1;

  -- 7 · Permisos: nadie de la app puede disparar los avisos; la tarea diaria está programada
  if has_function_privilege('authenticated', 'public.avisar_pagos_por_vencer(date)', 'execute')
     or has_function_privilege('anon', 'public.configurar_dia_vencimiento(integer)', 'execute') then
    raise exception 'FALLÓ 7: permisos de ejecución demasiado abiertos';
  end if;
  if not exists (select 1 from cron.job where jobname = 'avisar-pagos-por-vencer') then
    raise exception 'FALLÓ 7: no está programada la tarea diaria';
  end if;
  v_n := v_n + 1;

  raise exception 'RF09 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
