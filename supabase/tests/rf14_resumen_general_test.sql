-- =============================================================================================
-- Convive · Pruebas de base de datos del RF14 (resumen financiero de General y saldo inicial)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios, movimientos, PQRS y reservas de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF14 OK: 9 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: las migraciones de autenticación, finanzas, reservas, PQRS y 20261126000000_resumen_general.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_zona uuid;
  v_admin uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_vigilancia uuid := gen_random_uuid();
  v_perfil_admin uuid;
  v_perfil_residente uuid;
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_inicio_mes date := date_trunc('month', (now() at time zone 'America/Bogota'))::date;
  v_mes_anterior date := (date_trunc('month', (now() at time zone 'America/Bogota')) - interval '1 day')::date;
  v_r jsonb;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero administrador, residente y vigilancia
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF14', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF14', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF14-101') returning id into v_unidad;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'admin.rf14@convive.test', 'Admin RF14', 'administrador'),
    (v_conjunto, v_unidad, 'residente.rf14@convive.test', 'Residente RF14', 'residente'),
    (v_conjunto, null, 'vigilancia.rf14@convive.test', 'Vigilancia RF14', 'vigilancia');

  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf14@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf14@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vigilancia, 'authenticated', 'authenticated', 'vigilancia.rf14@convive.test');

  select id into v_perfil_admin from public.perfiles where user_id = v_admin;
  select id into v_perfil_residente from public.perfiles where user_id = v_residente;

  -- Movimientos: este mes 1.000.000 de ingreso y 400.000 de egresos; el mes anterior 500.000 de ingreso.
  insert into public.movimientos (conjunto_id, tipo, categoria_id, monto, fecha, descripcion, registrado_por) values
    (v_conjunto, 'ingreso', 'ing-admin', 1000000, v_hoy, 'Cuotas de este mes', v_perfil_admin),
    (v_conjunto, 'egreso', 'egr-nomina', 300000, v_inicio_mes, 'Nómina de este mes', v_perfil_admin),
    (v_conjunto, 'egreso', 'egr-aseo', 100000, v_hoy, 'Aseo de este mes', v_perfil_admin),
    (v_conjunto, 'ingreso', 'ing-admin', 500000, v_mes_anterior, 'Cuotas del mes anterior', v_perfil_admin),
    -- Otro conjunto: nunca debe sumar en el primero.
    (v_otro_conjunto, 'ingreso', 'ing-admin', 999999, v_hoy, 'Movimiento de otro conjunto', v_perfil_admin);

  -- PQRS de este mes: dos quejas (una resuelta) y un reporte de daño.
  insert into public.pqrs (conjunto_id, radicado, radicado_por, unidad_id, tipo, descripcion, estado) values
    (v_conjunto, 1, v_perfil_residente, v_unidad, 'queja', 'Ruido en la torre después de las diez', 'pendiente'),
    (v_conjunto, 2, v_perfil_residente, v_unidad, 'queja', 'Basura en la zona de parqueaderos', 'resuelto'),
    (v_conjunto, 3, v_perfil_residente, v_unidad, 'reporte_dano', 'Bombillo dañado en la portería', 'en_proceso');

  -- Reservas hechas hoy: una confirmada, una pendiente y una cancelada (no cuenta).
  insert into public.zonas_comunes (conjunto_id, nombre, hora_apertura, hora_cierre, aforo)
  values (v_conjunto, 'Cancha RF14', '06:00', '22:00', 12) returning id into v_zona;
  insert into public.reservas (conjunto_id, zona_id, unidad_id, reservado_por, fecha, hora_inicio, hora_fin, estado) values
    (v_conjunto, v_zona, v_unidad, v_perfil_residente, v_inicio_mes, '08:00', '09:00', 'confirmada'),
    (v_conjunto, v_zona, v_unidad, v_perfil_residente, v_inicio_mes, '10:00', '11:00', 'pendiente'),
    (v_conjunto, v_zona, v_unidad, v_perfil_residente, v_inicio_mes, '12:00', '13:00', 'cancelada');

  -- ------------------------------------------------------------------------------------------
  -- Permisos
  -- ------------------------------------------------------------------------------------------
  -- 1 · Vigilancia no ve el resumen
  perform set_config('request.jwt.claims', json_build_object('sub', v_vigilancia, 'role', 'authenticated')::text, true);
  begin
    perform public.resumen_general(v_inicio_mes, v_hoy);
    raise exception 'FALLÓ 1: vigilancia pudo consultar el resumen';
  exception when others then
    if sqlerrm <> 'sin_permiso' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- Como residente (solo totales)
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);

  -- 2 · Totales del mes y saldo con saldo inicial 0
  v_r := public.resumen_general(v_inicio_mes, v_hoy);
  if (v_r ->> 'ingresos')::numeric <> 1000000 or (v_r ->> 'egresos')::numeric <> 400000 then
    raise exception 'FALLÓ 2: ingresos % y egresos % (se esperaban 1.000.000 y 400.000)', v_r ->> 'ingresos', v_r ->> 'egresos';
  end if;
  if (v_r ->> 'saldo_actual')::numeric <> 1100000 then
    raise exception 'FALLÓ 2: saldo actual % (se esperaba 1.100.000: no depende del periodo ni del otro conjunto)', v_r ->> 'saldo_actual';
  end if;
  v_n := v_n + 1;

  -- 3 · Egresos por categoría, de mayor a menor
  if v_r -> 'gastos_por_categoria' -> 0 ->> 'categoria' <> 'Nómina' or jsonb_array_length(v_r -> 'gastos_por_categoria') <> 2 then
    raise exception 'FALLÓ 3: gastos por categoría %', v_r -> 'gastos_por_categoria';
  end if;
  v_n := v_n + 1;

  -- 4 · PQRS por tipo y por estado
  if v_r -> 'pqrs_por_tipo' -> 0 ->> 'tipo' <> 'queja' or (v_r -> 'pqrs_por_tipo' -> 0 ->> 'cantidad')::int <> 2
     or jsonb_array_length(v_r -> 'pqrs_por_estado') <> 3 then
    raise exception 'FALLÓ 4: PQRS por tipo % y por estado %', v_r -> 'pqrs_por_tipo', v_r -> 'pqrs_por_estado';
  end if;
  v_n := v_n + 1;

  -- 5 · Reservas por zona: confirmadas y pendientes, sin las canceladas
  if (v_r -> 'reservas_por_zona' -> 0 ->> 'cantidad')::int <> 2 then
    raise exception 'FALLÓ 5: reservas por zona % (se esperaban 2)', v_r -> 'reservas_por_zona';
  end if;
  v_n := v_n + 1;

  -- 6 · Movimiento de fondos: un registro por mes, también los meses sin movimientos
  v_r := public.resumen_general(v_mes_anterior, v_hoy);
  if jsonb_array_length(v_r -> 'mensual') <> 2 or (v_r -> 'mensual' -> 0 ->> 'ingresos')::numeric <> 500000 then
    raise exception 'FALLÓ 6: movimiento mensual %', v_r -> 'mensual';
  end if;
  v_n := v_n + 1;

  -- 7 · Rangos inválidos: al revés, a futuro o de más de 12 meses
  begin
    perform public.resumen_general(v_hoy, v_inicio_mes - 1);
    raise exception 'FALLÓ 7: aceptó un rango al revés';
  exception when others then
    if sqlerrm <> 'rango_invalido' then raise; end if;
  end;
  begin
    perform public.resumen_general(v_inicio_mes, v_hoy + 1);
    raise exception 'FALLÓ 7: aceptó una fecha final futura';
  exception when others then
    if sqlerrm <> 'rango_invalido' then raise; end if;
  end;
  begin
    perform public.resumen_general((v_hoy - interval '13 months')::date, v_hoy);
    raise exception 'FALLÓ 7: aceptó un rango de más de 12 meses';
  exception when others then
    if sqlerrm <> 'rango_invalido' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 8 · El residente no puede cambiar el saldo inicial
  begin
    perform public.configurar_saldo_inicial(1);
    raise exception 'FALLÓ 8: el residente cambió el saldo inicial';
  exception when others then
    if sqlerrm <> 'sin_permiso' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- Como administrador: saldo inicial
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 9 · El saldo inicial se suma al saldo actual; no se aceptan negativos ni más de 2 decimales
  perform public.configurar_saldo_inicial(2000000);
  if public.saldo_inicial_conjunto() <> 2000000
     or (public.resumen_general(v_inicio_mes, v_hoy) ->> 'saldo_actual')::numeric <> 3100000 then
    raise exception 'FALLÓ 9: el saldo inicial no se sumó al saldo actual';
  end if;
  begin
    perform public.configurar_saldo_inicial(-1);
    raise exception 'FALLÓ 9: aceptó un saldo inicial negativo';
  exception when others then
    if sqlerrm <> 'monto_invalido' then raise; end if;
  end;
  begin
    perform public.configurar_saldo_inicial(10.555);
    raise exception 'FALLÓ 9: aceptó más de 2 decimales';
  exception when others then
    if sqlerrm <> 'monto_invalido' then raise; end if;
  end;
  if (select saldo_inicial from public.conjuntos where id = v_otro_conjunto) <> 0 then
    raise exception 'FALLÓ 9: cambió el saldo inicial de otro conjunto';
  end if;
  v_n := v_n + 1;

  raise exception 'RF14 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
