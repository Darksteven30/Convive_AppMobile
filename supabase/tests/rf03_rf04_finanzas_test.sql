-- =============================================================================================
-- Convive · Pruebas de base de datos de RF03 y RF04 (finanzas)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios y movimientos de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF03/RF04 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261003000000_autenticacion.sql y 20261012000000_finanzas.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_admin uuid := gen_random_uuid();
  v_junta uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_admin_otro uuid := gen_random_uuid();
  v_perfil_otro uuid;
  v_id uuid;
  v_texto text;
  v_cantidad integer;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero administrador, junta y residente
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF03', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF03', 'Cali') returning id into v_otro_conjunto;

  insert into public.perfiles (conjunto_id, email, nombre, rol) values
    (v_conjunto, 'admin.rf03@convive.test', 'Admin RF03', 'administrador'),
    (v_conjunto, 'junta.rf03@convive.test', 'Junta RF03', 'junta_directiva'),
    (v_conjunto, 'residente.rf03@convive.test', 'Residente RF03', 'residente'),
    (v_otro_conjunto, 'admin.otro.rf03@convive.test', 'Admin otro RF03', 'administrador');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf03@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_junta, 'authenticated', 'authenticated', 'junta.rf03@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf03@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin_otro, 'authenticated', 'authenticated', 'admin.otro.rf03@convive.test');

  select id into v_perfil_otro from public.perfiles where user_id = v_admin_otro;

  -- Un movimiento del otro conjunto: nunca debe aparecer en las consultas del primero.
  insert into public.movimientos (conjunto_id, tipo, categoria_id, monto, fecha, descripcion, registrado_por)
  values (v_otro_conjunto, 'ingreso', 'ing-admin', 999, '2026-09-01', 'Movimiento de otro conjunto', v_perfil_otro);

  -- ------------------------------------------------------------------------------------------
  -- RF03 · registrar_movimiento() como administrador
  -- ------------------------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 1 · Registra el movimiento con la auditoría y la descripción sin espacios en los extremos.
  select r.id, r.categoria into v_id, v_texto
    from public.registrar_movimiento('egreso', 'egr-aseo', 350000.456, '2026-09-15', '  Compra de insumos de aseo  ') r;
  assert v_texto = 'Aseo', 'FALLÓ 1: no devolvió el nombre de la categoría';
  assert (select descripcion from public.movimientos where id = v_id) = 'Compra de insumos de aseo',
    'FALLÓ 1: no recortó la descripción';
  assert (select monto from public.movimientos where id = v_id) = 350000.46, 'FALLÓ 1: no redondeó el monto a 2 decimales';
  assert (select conjunto_id from public.movimientos where id = v_id) = v_conjunto, 'FALLÓ 1: guardó otro conjunto';
  assert (select p.user_id from public.movimientos m join public.perfiles p on p.id = m.registrado_por where m.id = v_id) = v_admin,
    'FALLÓ 1: la auditoría no es del administrador';
  v_n := v_n + 1;

  -- 2 · Categoría inactiva (Eventos) o de otro tipo → categoria_invalida (MSG-RF03-03).
  begin
    perform public.registrar_movimiento('egreso', 'egr-eventos', 1000, '2026-09-15', 'Fiesta de fin de año');
    raise exception 'FALLÓ 2: aceptó una categoría inactiva';
  exception when others then
    if sqlerrm not like 'categoria_invalida%' then raise; end if;
  end;
  begin
    perform public.registrar_movimiento('ingreso', 'egr-aseo', 1000, '2026-09-15', 'Tipo que no corresponde');
    raise exception 'FALLÓ 2: aceptó una categoría de otro tipo';
  exception when others then
    if sqlerrm not like 'categoria_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 3 · Monto en 0 o mayor a $ 999.999.999,99 → monto_invalido (MSG-RF03-02).
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 0, '2026-09-15', 'Monto en cero');
    raise exception 'FALLÓ 3: aceptó un monto en 0';
  exception when others then
    if sqlerrm not like 'monto_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000000000, '2026-09-15', 'Monto muy alto');
    raise exception 'FALLÓ 3: aceptó un monto mayor al máximo';
  exception when others then
    if sqlerrm not like 'monto_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 4 · Fecha posterior a hoy (hora de Colombia) → fecha_futura (MSG-RF03-04).
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, ((now() at time zone 'America/Bogota')::date + 1), 'Fecha del futuro');
    raise exception 'FALLÓ 4: aceptó una fecha futura';
  exception when others then
    if sqlerrm not like 'fecha_futura%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 5 · Descripción de menos de 5 caracteres (sin contar espacios) → descripcion_invalida (MSG-RF03-05).
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', '  abcd  ');
    raise exception 'FALLÓ 5: aceptó una descripción corta';
  exception when others then
    if sqlerrm not like 'descripcion_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 6 · Soporte en la carpeta de otro conjunto, de tipo no permitido o de más de 5 MB → soporte_invalido.
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', 'Soporte ajeno',
      v_otro_conjunto::text || '/x.pdf', 'x.pdf', 'application/pdf', 100);
    raise exception 'FALLÓ 6: aceptó un soporte de otro conjunto';
  exception when others then
    if sqlerrm not like 'soporte_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', 'Soporte GIF',
      v_conjunto::text || '/x.gif', 'x.gif', 'image/gif', 100);
    raise exception 'FALLÓ 6: aceptó un soporte GIF';
  exception when others then
    if sqlerrm not like 'soporte_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', 'Soporte grande',
      v_conjunto::text || '/x.pdf', 'x.pdf', 'application/pdf', 5242881);
    raise exception 'FALLÓ 6: aceptó un soporte de más de 5 MB';
  exception when others then
    if sqlerrm not like 'soporte_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 7 · Con un soporte válido de su conjunto lo guarda.
  select r.id into v_id
    from public.registrar_movimiento('ingreso', 'ing-zonas', 450000, '2026-09-20', 'Alquiler del salón social',
      v_conjunto::text || '/factura.pdf', 'factura.pdf', 'application/pdf', 2048) r;
  assert (select soporte_ruta from public.movimientos where id = v_id) = v_conjunto::text || '/factura.pdf',
    'FALLÓ 7: no guardó la ruta del soporte';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF04 · movimientos_financieros()
  -- ------------------------------------------------------------------------------------------

  -- 8 · El administrador ve solo los movimientos de su conjunto, del más reciente al más antiguo.
  select count(*) into v_cantidad from public.movimientos_financieros();
  assert v_cantidad = 2, format('FALLÓ 8: esperaba 2 movimientos del conjunto y vio %s', v_cantidad);
  assert (select fecha from public.movimientos_financieros() limit 1) = '2026-09-20', 'FALLÓ 8: no ordenó del más reciente';
  v_n := v_n + 1;

  -- 9 · Filtra por periodo (extremos incluidos) y categoría.
  select count(*) into v_cantidad from public.movimientos_financieros('2026-09-15', '2026-09-15', null);
  assert v_cantidad = 1, 'FALLÓ 9: no incluyó el extremo del rango';
  select count(*) into v_cantidad from public.movimientos_financieros('2026-09-01', '2026-09-30', 'ing-zonas');
  assert v_cantidad = 1, 'FALLÓ 9: no filtró por categoría';
  v_n := v_n + 1;

  -- 10 · Rango inválido: inicial mayor que la final, mayor a 12 meses o final posterior a hoy.
  begin
    perform public.movimientos_financieros('2026-09-30', '2026-09-01', null);
    raise exception 'FALLÓ 10: aceptó la fecha inicial mayor que la final';
  exception when others then
    if sqlerrm not like 'rango_invalido%' then raise; end if;
  end;
  begin
    perform public.movimientos_financieros('2025-01-01', '2026-09-01', null);
    raise exception 'FALLÓ 10: aceptó un rango mayor a 12 meses';
  exception when others then
    if sqlerrm not like 'rango_invalido%' then raise; end if;
  end;
  begin
    perform public.movimientos_financieros((now() at time zone 'America/Bogota')::date, ((now() at time zone 'America/Bogota')::date + 1), null);
    raise exception 'FALLÓ 10: aceptó una fecha final futura';
  exception when others then
    if sqlerrm not like 'rango_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- Permisos por rol
  -- ------------------------------------------------------------------------------------------

  -- 11 · La junta directiva consulta (solo lectura) y ve quién registró, pero no registra.
  perform set_config('request.jwt.claims', json_build_object('sub', v_junta, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.movimientos_financieros();
  assert v_cantidad = 2, 'FALLÓ 11: la junta no ve los movimientos de su conjunto';
  assert (select registrado_por from public.movimientos_financieros() limit 1) = 'Admin RF03',
    'FALLÓ 11: la junta no ve quién registró el movimiento';
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', 'La junta no registra');
    raise exception 'FALLÓ 11: la junta pudo registrar un movimiento';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 12 · El residente no consulta ni registra (MSG-RF03-07 / MSG-RF04-07).
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  begin
    perform public.movimientos_financieros();
    raise exception 'FALLÓ 12: el residente pudo consultar las finanzas';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.registrar_movimiento('egreso', 'egr-aseo', 1000, '2026-09-15', 'El residente no registra');
    raise exception 'FALLÓ 12: el residente pudo registrar un movimiento';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 13 · El administrador del otro conjunto solo ve el suyo.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.movimientos_financieros();
  assert v_cantidad = 1, 'FALLÓ 13: un administrador vio movimientos de otro conjunto';
  v_n := v_n + 1;

  -- 14 · El bucket de soportes es privado, de máx. 5 MB y solo PDF, JPG o PNG.
  assert exists (
    select 1 from storage.buckets
     where id = 'soportes-financieros' and not public and file_size_limit = 5242880
       and allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png']
  ), 'FALLÓ 14: el bucket soportes-financieros no existe o está mal configurado';
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF03/RF04 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
