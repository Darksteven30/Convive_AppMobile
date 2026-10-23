-- =============================================================================================
-- Convive · Pruebas de base de datos de RF07 (radicación de PQRS y reportes de daño con fotos)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios, fotos y PQRS de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF07 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid(). Las fotos «subidas» se
-- simulan con filas en storage.objects (su formato y tamaño van en metadata, como en Storage).
-- Requiere: 20261003000000_autenticacion.sql y 20261022000000_pqrs.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_residente uuid := gen_random_uuid();
  v_vecino uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_admin_otro uuid := gen_random_uuid();
  v_perfil_admin uuid;
  v_id uuid;
  v_id_dano uuid;
  v_radicado integer;
  v_estado public.estado_pqrs;
  v_detalle jsonb;
  v_cantidad integer;
  v_n integer := 0;
  v_descripcion text := 'La baranda de la escalera de la torre 2 está suelta.';
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero dos residentes y un administrador
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF07', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF07', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF07-101') returning id into v_unidad;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, v_unidad, 'residente.rf07@convive.test', 'Residente RF07', 'residente'),
    (v_conjunto, null, 'vecino.rf07@convive.test', 'Vecino RF07', 'residente'),
    (v_conjunto, null, 'admin.rf07@convive.test', 'Admin RF07', 'administrador'),
    (v_otro_conjunto, null, 'admin.otro.rf07@convive.test', 'Admin otro RF07', 'administrador');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf07@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vecino, 'authenticated', 'authenticated', 'vecino.rf07@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf07@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin_otro, 'authenticated', 'authenticated', 'admin.otro.rf07@convive.test');

  select id into v_perfil_admin from public.perfiles where user_id = v_admin;

  -- Fotos «subidas» al bucket: del residente (válidas y no válidas) y una del vecino.
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('pqrs-fotos', v_conjunto || '/a.jpg', v_residente::text, '{"mimetype": "image/jpeg", "size": 250000}'),
    ('pqrs-fotos', v_conjunto || '/b.png', v_residente::text, '{"mimetype": "image/png", "size": 400000}'),
    ('pqrs-fotos', v_conjunto || '/c.jpg', v_residente::text, '{"mimetype": "image/jpeg", "size": 300000}'),
    ('pqrs-fotos', v_conjunto || '/d.jpg', v_residente::text, '{"mimetype": "image/jpeg", "size": 300000}'),
    ('pqrs-fotos', v_conjunto || '/animacion.gif', v_residente::text, '{"mimetype": "image/gif", "size": 1000}'),
    ('pqrs-fotos', v_conjunto || '/enorme.jpg', v_residente::text, '{"mimetype": "image/jpeg", "size": 6000000}'),
    ('pqrs-fotos', v_conjunto || '/del-vecino.jpg', v_vecino::text, '{"mimetype": "image/jpeg", "size": 1000}');

  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------------------------------------
  -- RF07 · radicar_pqrs()
  -- ------------------------------------------------------------------------------------------

  -- 1 · Radica sin fotos: radicado 1, «pendiente», con la unidad y la descripción sin espacios extra.
  select r.id, r.radicado, r.estado into v_id, v_radicado, v_estado
    from public.radicar_pqrs('peticion', '  Instalar más bancas en el parque infantil.  ') r;
  assert v_radicado = 1, 'FALLÓ 1: el primer radicado del conjunto no es 1';
  assert v_estado = 'pendiente', 'FALLÓ 1: no quedó pendiente';
  assert (select descripcion from public.pqrs where id = v_id) = 'Instalar más bancas en el parque infantil.',
    'FALLÓ 1: no recortó la descripción';
  assert (select unidad_id from public.pqrs where id = v_id) = v_unidad, 'FALLÓ 1: no guardó la unidad';
  assert (select conjunto_id from public.pqrs where id = v_id) = v_conjunto, 'FALLÓ 1: guardó otro conjunto';
  v_n := v_n + 1;

  -- 2 · Avisa solo a la administración del conjunto.
  assert (select count(*) from public.notificaciones where referencia_id = v_id) = 1,
    'FALLÓ 2: no hay exactamente un aviso';
  assert (select perfil_id from public.notificaciones where referencia_id = v_id) = v_perfil_admin,
    'FALLÓ 2: el aviso no es para el administrador del conjunto';
  assert (select mensaje from public.notificaciones where referencia_id = v_id) = 'Residente RF07 radicó la solicitud #0001.',
    'FALLÓ 2: el texto del aviso no es el esperado';
  v_n := v_n + 1;

  -- 3 · Reporte de daño con fotos: consecutivo 2 y fotos con el formato y tamaño leídos de Storage.
  select r.id, r.radicado into v_id_dano, v_radicado
    from public.radicar_pqrs('reporte_dano', v_descripcion, array[v_conjunto || '/a.jpg', v_conjunto || '/b.png']) r;
  assert v_radicado = 2, 'FALLÓ 3: el radicado no es consecutivo';
  assert (select count(*) from public.pqrs_fotos where pqrs_id = v_id_dano) = 2, 'FALLÓ 3: no guardó las 2 fotos';
  assert (select tipo || ':' || bytes from public.pqrs_fotos where pqrs_id = v_id_dano and orden = 2) = 'image/png:400000',
    'FALLÓ 3: la segunda foto no tiene el formato y tamaño de Storage';
  v_n := v_n + 1;

  -- 4 · El reporte de daño exige al menos una foto → foto_obligatoria (MSG-RF07-07).
  begin
    perform public.radicar_pqrs('reporte_dano', v_descripcion);
    raise exception 'FALLÓ 4: radicó un reporte de daño sin foto';
  exception when others then
    if sqlerrm not like 'foto_obligatoria%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 5 · Tipo obligatorio (MSG-RF07-02) y descripción de 20 a 1.000 caracteres (MSG-RF07-03).
  begin
    perform public.radicar_pqrs(null, v_descripcion);
    raise exception 'FALLÓ 5: radicó sin tipo';
  exception when others then
    if sqlerrm not like 'tipo_invalido%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', '   ' || repeat('x', 19) || '   ');
    raise exception 'FALLÓ 5: aceptó una descripción de 19 caracteres';
  exception when others then
    if sqlerrm not like 'descripcion_invalida%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', repeat('x', 1001));
    raise exception 'FALLÓ 5: aceptó una descripción de 1.001 caracteres';
  exception when others then
    if sqlerrm not like 'descripcion_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 6 · Máximo 3 fotos → demasiadas_fotos (MSG-RF07-06).
  begin
    perform public.radicar_pqrs('queja', v_descripcion,
      array[v_conjunto || '/c.jpg', v_conjunto || '/d.jpg', v_conjunto || '/a.jpg', v_conjunto || '/b.png']);
    raise exception 'FALLÓ 6: aceptó 4 fotos';
  exception when others then
    if sqlerrm not like 'demasiadas_fotos%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 7 · Solo JPG o PNG (MSG-RF07-04) de máx. 5 MB (MSG-RF07-05), según lo que guardó Storage.
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/animacion.gif']);
    raise exception 'FALLÓ 7: aceptó un GIF';
  exception when others then
    if sqlerrm not like 'formato_invalido%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/enorme.jpg']);
    raise exception 'FALLÓ 7: aceptó una foto de 6 MB';
  exception when others then
    if sqlerrm not like 'foto_grande%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 8 · Solo fotos propias, existentes, no repetidas y no usadas en otra PQRS → foto_invalida.
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/del-vecino.jpg']);
    raise exception 'FALLÓ 8: aceptó la foto de otra persona';
  exception when others then
    if sqlerrm not like 'foto_invalida%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/no-existe.jpg']);
    raise exception 'FALLÓ 8: aceptó una foto que no está en Storage';
  exception when others then
    if sqlerrm not like 'foto_invalida%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/c.jpg', v_conjunto || '/c.jpg']);
    raise exception 'FALLÓ 8: aceptó la misma foto dos veces';
  exception when others then
    if sqlerrm not like 'foto_invalida%' then raise; end if;
  end;
  begin
    perform public.radicar_pqrs('queja', v_descripcion, array[v_conjunto || '/a.jpg']);
    raise exception 'FALLÓ 8: aceptó una foto que ya es de otra PQRS';
  exception when others then
    if sqlerrm not like 'foto_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 9 · Sin perfil (sesión de alguien que no está registrado) → sin_permiso.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.radicar_pqrs('queja', v_descripcion);
    raise exception 'FALLÓ 9: radicó sin perfil';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 10 · El consecutivo es por conjunto: en el otro conjunto empieza en 1.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  select r.radicado into v_radicado from public.radicar_pqrs('sugerencia', v_descripcion) r;
  assert v_radicado = 1, 'FALLÓ 10: el otro conjunto no empezó en el radicado 1';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF07 · mis_pqrs() y detalle_pqrs()
  -- ------------------------------------------------------------------------------------------

  -- Una respuesta de la administración para el reporte de daño.
  insert into public.pqrs_respuestas (pqrs_id, autor_id, mensaje, estado)
  values (v_id_dano, v_perfil_admin, 'Mañana viene el soldador.', 'en_proceso');

  -- 11 · mis_pqrs(): solo las propias, de la más reciente a la más antigua.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.mis_pqrs();
  assert v_cantidad = 2, 'FALLÓ 11: se esperaban 2 PQRS propias y hay ' || v_cantidad;
  assert (select m.radicado from public.mis_pqrs() m limit 1) = 2, 'FALLÓ 11: la más reciente no va primero';
  perform set_config('request.jwt.claims', json_build_object('sub', v_vecino, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.mis_pqrs();
  assert v_cantidad = 0, 'FALLÓ 11: el vecino ve PQRS ajenas';
  v_n := v_n + 1;

  -- 12 · detalle_pqrs(): fotos en orden y respuestas con el nombre de quien respondió.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  v_detalle := public.detalle_pqrs(v_id_dano);
  assert (v_detalle ->> 'radicado')::integer = 2, 'FALLÓ 12: el detalle no trae el radicado';
  assert jsonb_array_length(v_detalle -> 'fotos') = 2, 'FALLÓ 12: el detalle no trae las 2 fotos';
  assert v_detalle -> 'fotos' -> 0 ->> 'ruta' = v_conjunto || '/a.jpg', 'FALLÓ 12: las fotos no van en orden';
  assert v_detalle -> 'respuestas' -> 0 ->> 'autor' = 'Admin RF07', 'FALLÓ 12: la respuesta no trae el autor';
  assert v_detalle -> 'respuestas' -> 0 ->> 'estado' = 'en_proceso', 'FALLÓ 12: la respuesta no trae el estado';
  v_n := v_n + 1;

  -- 13 · El detalle es solo del autor o de la administración de su conjunto → no_encontrada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_vecino, 'role', 'authenticated')::text, true);
  begin
    perform public.detalle_pqrs(v_id_dano);
    raise exception 'FALLÓ 13: el vecino vio el detalle de una PQRS ajena';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  begin
    perform public.detalle_pqrs(v_id_dano);
    raise exception 'FALLÓ 13: un administrador vio una PQRS de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_detalle := public.detalle_pqrs(v_id_dano);
  assert (v_detalle ->> 'radicado')::integer = 2, 'FALLÓ 13: el administrador no ve la PQRS de su conjunto';
  v_n := v_n + 1;

  -- 14 · Las tablas tienen Row Level Security, sin escrituras directas, y el bucket está bien configurado.
  assert (select bool_and(relrowsecurity) from pg_class
           where oid in ('public.pqrs'::regclass, 'public.pqrs_fotos'::regclass,
                         'public.pqrs_respuestas'::regclass, 'public.notificaciones'::regclass)),
    'FALLÓ 14: hay una tabla sin RLS';
  assert not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename in ('pqrs', 'pqrs_fotos', 'pqrs_respuestas', 'notificaciones')
       and cmd <> 'SELECT'
  ), 'FALLÓ 14: hay políticas de escritura directa';
  assert exists (
    select 1 from storage.buckets
     where id = 'pqrs-fotos' and not public and file_size_limit = 5242880
       and allowed_mime_types @> array['image/jpeg', 'image/png'] and cardinality(allowed_mime_types) = 2
  ), 'FALLÓ 14: el bucket pqrs-fotos no existe o está mal configurado';
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF07 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
