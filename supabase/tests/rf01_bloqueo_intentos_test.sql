-- =============================================================================================
-- Convive · Pruebas de base de datos del RF01 (bloqueo tras 5 intentos fallidos)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) el conjunto, el perfil, el usuario y los intentos de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF01 OK: 7 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- Requiere: 20261003000000_autenticacion.sql y 20261017000000_bloqueo_intentos.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_unidad uuid;
  v_usuario uuid := gen_random_uuid();
  v_email text := 'prueba.bloqueo@convive.test';
  v_quedan integer;
  v_n integer := 0;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba bloqueo', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'B01') returning id into v_unidad;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol)
  values (v_conjunto, v_unidad, v_email, 'Prueba bloqueo', 'residente');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_usuario, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, 'hash-de-prueba', now(), now(), now());

  -- 1 · Antes de iniciar sesión (anon) ya no se puede borrar el contador de nadie
  if to_regprocedure('public.registrar_intento(text, boolean)') is not null then
    raise exception 'FALLÓ 1: todavía existe registrar_intento(text, boolean)';
  end if;
  if has_function_privilege('anon', 'public.limpiar_intentos()', 'execute') then
    raise exception 'FALLÓ 1: anon puede ejecutar limpiar_intentos()';
  end if;
  if not has_function_privilege('anon', 'public.registrar_intento_fallido(text)', 'execute') then
    raise exception 'FALLÓ 1: anon no puede registrar un intento fallido';
  end if;
  v_n := v_n + 1;

  -- 2 · Cada intento fallido descuenta uno
  v_quedan := public.registrar_intento_fallido(' PRUEBA.BLOQUEO@convive.test ');
  if v_quedan <> 4 then
    raise exception 'FALLÓ 2: tras 1 intento fallido quedan % (se esperaban 4)', v_quedan;
  end if;
  v_n := v_n + 1;

  -- 3 · Al quinto intento la cuenta queda bloqueada 15 minutos
  perform public.registrar_intento_fallido(v_email) from generate_series(1, 3);
  v_quedan := public.registrar_intento_fallido(v_email);
  if v_quedan <> 0 or public.minutos_bloqueo(v_email) not between 14 and 15 then
    raise exception 'FALLÓ 3: al quinto intento quedan % y el bloqueo es de % min', v_quedan, public.minutos_bloqueo(v_email);
  end if;
  v_n := v_n + 1;

  -- 4 · Con una sesión de la propia cuenta, limpiar_intentos() no quita un bloqueo activo
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  perform public.limpiar_intentos();
  if public.minutos_bloqueo(v_email) = 0 then
    raise exception 'FALLÓ 4: limpiar_intentos() quitó un bloqueo activo';
  end if;
  v_n := v_n + 1;

  -- 5 · Más intentos durante el bloqueo no lo alargan
  update public.intentos_login set bloqueado_hasta = now() + interval '5 minutes' where email = v_email;
  perform public.registrar_intento_fallido(v_email);
  if public.minutos_bloqueo(v_email) > 5 then
    raise exception 'FALLÓ 5: un intento durante el bloqueo lo alargó a % min', public.minutos_bloqueo(v_email);
  end if;
  v_n := v_n + 1;

  -- 6 · Vencido el bloqueo, iniciar sesión limpia el contador
  update public.intentos_login set bloqueado_hasta = now() - interval '1 minute' where email = v_email;
  perform public.limpiar_intentos();
  if exists (select 1 from public.intentos_login where email = v_email) then
    raise exception 'FALLÓ 6: limpiar_intentos() no borró el contador vencido';
  end if;
  v_n := v_n + 1;

  -- 7 · Los correos que no están pre-registrados no se guardan
  perform public.registrar_intento_fallido('nadie.bloqueo@convive.test');
  if exists (select 1 from public.intentos_login where email = 'nadie.bloqueo@convive.test') then
    raise exception 'FALLÓ 7: se guardó un intento de un correo no registrado';
  end if;
  v_n := v_n + 1;

  raise exception 'RF01 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
