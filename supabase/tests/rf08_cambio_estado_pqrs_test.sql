-- =============================================================================================
-- Convive · Pruebas de base de datos de RF08 (cambio de estado de PQRS / daño)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios y PQRS de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF08 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261003000000_autenticacion.sql, 20261022000000_pqrs.sql y
-- 20261023000000_cambio_estado_pqrs.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_residente uuid := gen_random_uuid();
  v_junta uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_admin_otro uuid := gen_random_uuid();
  v_perfil_residente uuid;
  v_perfil_admin uuid;
  v_pqrs uuid;
  v_otra uuid;
  v_detalle text;
  v_json jsonb;
  v_cantidad integer;
  v_n integer := 0;
  v_respuesta text := 'Se ajustó el motor del portón y ya cierra bien.';
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero residente, junta y administrador
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF08', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF08', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF08-101') returning id into v_unidad;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, v_unidad, 'residente.rf08@convive.test', 'Residente RF08', 'residente'),
    (v_conjunto, null, 'junta.rf08@convive.test', 'Junta RF08', 'junta_directiva'),
    (v_conjunto, null, 'admin.rf08@convive.test', 'Admin RF08', 'administrador'),
    (v_otro_conjunto, null, 'admin.otro.rf08@convive.test', 'Admin otro RF08', 'administrador');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf08@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_junta, 'authenticated', 'authenticated', 'junta.rf08@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf08@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin_otro, 'authenticated', 'authenticated', 'admin.otro.rf08@convive.test');

  select id into v_perfil_residente from public.perfiles where user_id = v_residente;
  select id into v_perfil_admin from public.perfiles where user_id = v_admin;

  -- El residente radica dos PQRS (RF07).
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  select r.id into v_pqrs from public.radicar_pqrs('queja', 'El portón vehicular no cierra completamente.') r;
  select r.id into v_otra from public.radicar_pqrs('peticion', 'Instalar más bancas en el parque infantil.') r;

  -- ------------------------------------------------------------------------------------------
  -- RF08 · pqrs_conjunto()
  -- ------------------------------------------------------------------------------------------

  -- 1 · El administrador ve todas las PQRS de su conjunto con quién las radicó y su unidad.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.pqrs_conjunto();
  assert v_cantidad = 2, 'FALLÓ 1: se esperaban 2 PQRS y hay ' || v_cantidad;
  assert (select c.radicado_por || '|' || c.unidad from public.pqrs_conjunto() c where c.id = v_pqrs) = 'Residente RF08|RF08-101',
    'FALLÓ 1: no trae quién la radicó y su unidad';
  assert (select c.radicado from public.pqrs_conjunto() c limit 1) = 2, 'FALLÓ 1: la más reciente no va primero';
  v_n := v_n + 1;

  -- 2 · Solo el administrador (MSG-RF08-04) y solo su conjunto.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  begin
    perform public.pqrs_conjunto();
    raise exception 'FALLÓ 2: el residente listó las PQRS del conjunto';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_junta, 'role', 'authenticated')::text, true);
  begin
    perform public.pqrs_conjunto();
    raise exception 'FALLÓ 2: la junta listó las PQRS del conjunto';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.pqrs_conjunto();
  assert v_cantidad = 0, 'FALLÓ 2: un administrador vio PQRS de otro conjunto';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF08 · cambiar_estado_pqrs()
  -- ------------------------------------------------------------------------------------------

  -- 3 · Solo el administrador cambia el estado → sin_permiso (MSG-RF08-04).
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'en_proceso');
    raise exception 'FALLÓ 3: el residente cambió el estado';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_junta, 'role', 'authenticated')::text, true);
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'en_proceso');
    raise exception 'FALLÓ 3: la junta cambió el estado';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 4 · El administrador de otro conjunto no la encuentra → no_encontrada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'en_proceso');
    raise exception 'FALLÓ 4: cambió una PQRS de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- 5 · Pendiente → Resuelto no se permite (hay que pasar por En proceso) → transicion_invalida.
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'resuelto', v_respuesta);
    raise exception 'FALLÓ 5: pasó de Pendiente a Resuelto';
  exception when others then
    if sqlerrm not like 'transicion_invalida%' then raise; end if;
    get stacked diagnostics v_detalle = pg_exception_detail;
    assert v_detalle = 'pendiente|resuelto', 'FALLÓ 5: el detalle no trae «actual|nuevo»: ' || coalesce(v_detalle, '(vacío)');
  end;
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'pendiente');
    raise exception 'FALLÓ 5: aceptó dejarla en el mismo estado';
  exception when others then
    if sqlerrm not like 'transicion_invalida%' then raise; end if;
  end;
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, null);
    raise exception 'FALLÓ 5: aceptó un estado vacío';
  exception when others then
    if sqlerrm not like 'transicion_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 6 · Pendiente → En proceso sin comentario: guarda el estado, el historial con usuario y fecha,
  --     y el aviso al propietario.
  perform public.cambiar_estado_pqrs(v_pqrs, 'en_proceso');
  assert (select estado from public.pqrs where id = v_pqrs) = 'en_proceso', 'FALLÓ 6: no cambió el estado';
  assert (select count(*) from public.pqrs_respuestas where pqrs_id = v_pqrs) = 1, 'FALLÓ 6: no dejó la respuesta';
  assert (select autor_id = v_perfil_admin and mensaje = 'Cambió el estado a En proceso.' and estado = 'en_proceso'
                 and created_at is not null
            from public.pqrs_respuestas where pqrs_id = v_pqrs),
    'FALLÓ 6: la respuesta no tiene el autor, el texto o el estado esperados';
  assert (select count(*) from public.notificaciones
           where perfil_id = v_perfil_residente and tipo = 'pqrs_estado' and referencia_id = v_pqrs
             and mensaje = 'Tu solicitud #0001 ahora está «En proceso».') = 1,
    'FALLÓ 6: no creó el aviso para el propietario';
  v_n := v_n + 1;

  -- 7 · Resolver exige comentario (MSG-RF08-02) de 10 a 500 caracteres.
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'resuelto', '   ');
    raise exception 'FALLÓ 7: resolvió sin comentario';
  exception when others then
    if sqlerrm not like 'comentario_obligatorio%' then raise; end if;
  end;
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'resuelto', repeat('x', 9));
    raise exception 'FALLÓ 7: aceptó un comentario de 9 caracteres';
  exception when others then
    if sqlerrm not like 'comentario_invalido%' then raise; end if;
  end;
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'resuelto', repeat('x', 501));
    raise exception 'FALLÓ 7: aceptó un comentario de 501 caracteres';
  exception when others then
    if sqlerrm not like 'comentario_invalido%' then raise; end if;
  end;
  -- Los intentos fallidos no dejaron nada.
  assert (select estado from public.pqrs where id = v_pqrs) = 'en_proceso', 'FALLÓ 7: un intento fallido cambió el estado';
  assert (select count(*) from public.pqrs_respuestas where pqrs_id = v_pqrs) = 1, 'FALLÓ 7: un intento fallido dejó respuesta';
  v_n := v_n + 1;

  -- 8 · En proceso → Resuelto con comentario: queda el comentario sin espacios extra.
  perform public.cambiar_estado_pqrs(v_pqrs, 'resuelto', '  ' || v_respuesta || '  ');
  assert (select estado from public.pqrs where id = v_pqrs) = 'resuelto', 'FALLÓ 8: no quedó resuelta';
  assert (select mensaje from public.pqrs_respuestas where pqrs_id = v_pqrs and estado = 'resuelto') = v_respuesta,
    'FALLÓ 8: no guardó la respuesta recortada';
  v_n := v_n + 1;

  -- 9 · Resuelto es final → transicion_invalida.
  begin
    perform public.cambiar_estado_pqrs(v_pqrs, 'en_proceso', 'Se reabre la solicitud.');
    raise exception 'FALLÓ 9: reabrió una PQRS resuelta';
  exception when others then
    if sqlerrm not like 'transicion_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 10 · El comentario opcional al pasar a En proceso también queda en el historial.
  perform public.cambiar_estado_pqrs(v_otra, 'en_proceso', 'Lo revisamos en la próxima reunión.');
  assert (select mensaje from public.pqrs_respuestas where pqrs_id = v_otra) = 'Lo revisamos en la próxima reunión.',
    'FALLÓ 10: no guardó el comentario opcional';
  v_n := v_n + 1;

  -- 11 · Una PQRS que no existe → no_encontrada.
  begin
    perform public.cambiar_estado_pqrs(gen_random_uuid(), 'en_proceso');
    raise exception 'FALLÓ 11: cambió una PQRS que no existe';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF07 / RF08 · detalle_pqrs()
  -- ------------------------------------------------------------------------------------------

  -- 12 · El propietario ve el historial con quién respondió; no recibe su propio nombre como dato extra.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  v_json := public.detalle_pqrs(v_pqrs);
  assert v_json ->> 'estado' = 'resuelto', 'FALLÓ 12: el propietario no ve el estado nuevo';
  assert jsonb_array_length(v_json -> 'respuestas') = 2, 'FALLÓ 12: el propietario no ve las 2 respuestas';
  assert v_json -> 'respuestas' -> 1 ->> 'mensaje' = v_respuesta, 'FALLÓ 12: el propietario no ve la respuesta final';
  assert v_json -> 'respuestas' -> 1 ->> 'autor' = 'Admin RF08', 'FALLÓ 12: la respuesta no trae el autor';
  assert v_json ->> 'radicado_por' is null, 'FALLÓ 12: el propietario recibió radicado_por';
  v_n := v_n + 1;

  -- 13 · El administrador ve quién la radicó y su unidad.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_json := public.detalle_pqrs(v_pqrs);
  assert v_json ->> 'radicado_por' = 'Residente RF08' and v_json ->> 'unidad' = 'RF08-101',
    'FALLÓ 13: el administrador no ve quién la radicó';
  v_n := v_n + 1;

  -- 14 · Los avisos al propietario: uno por cada cambio de estado de sus PQRS.
  select count(*) into v_cantidad
    from public.notificaciones
   where perfil_id = v_perfil_residente and tipo = 'pqrs_estado';
  assert v_cantidad = 3, 'FALLÓ 14: se esperaban 3 avisos al propietario y hay ' || v_cantidad;
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF08 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
