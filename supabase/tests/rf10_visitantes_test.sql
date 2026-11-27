-- =============================================================================================
-- Convive · Pruebas de base de datos de RF10 (registro de ingreso y salida de visitantes)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios y visitas de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF10 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261003000000_autenticacion.sql y 20261030000000_visitantes.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_unidad_otra uuid;
  v_vigilante uuid := gen_random_uuid();
  v_vigilante_2 uuid := gen_random_uuid();
  v_vigilante_otro uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_perfil_vigilante uuid;
  v_perfil_vigilante_2 uuid;
  v_visita uuid;
  v_moto uuid;
  v_entrada timestamptz;
  v_salida timestamptz;
  v_texto text;
  v_cantidad integer;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero dos vigilantes, un residente y un administrador
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF10', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF10', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre, direccion) values (v_conjunto, 'RF10-101', 'Torre 1 · 101') returning id into v_unidad;
  insert into public.unidades (conjunto_id, nombre) values (v_otro_conjunto, 'RF10-OTRA') returning id into v_unidad_otra;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'vigilante.rf10@convive.test', 'Vigilante RF10', 'vigilancia'),
    (v_conjunto, null, 'vigilante2.rf10@convive.test', 'Vigilante 2 RF10', 'vigilancia'),
    (v_otro_conjunto, null, 'vigilante.otro.rf10@convive.test', 'Vigilante otro RF10', 'vigilancia'),
    (v_conjunto, v_unidad, 'residente.rf10@convive.test', 'Residente RF10', 'residente'),
    (v_conjunto, null, 'admin.rf10@convive.test', 'Admin RF10', 'administrador');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_vigilante, 'authenticated', 'authenticated', 'vigilante.rf10@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vigilante_2, 'authenticated', 'authenticated', 'vigilante2.rf10@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vigilante_otro, 'authenticated', 'authenticated', 'vigilante.otro.rf10@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf10@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf10@convive.test');

  select id into v_perfil_vigilante from public.perfiles where user_id = v_vigilante;
  select id into v_perfil_vigilante_2 from public.perfiles where user_id = v_vigilante_2;

  perform set_config('request.jwt.claims', json_build_object('sub', v_vigilante, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------------------------------------
  -- RF10 · registrar_entrada_visitante()
  -- ------------------------------------------------------------------------------------------

  -- 1 · La entrada guarda los datos normalizados, la hora del servidor y quién la registró.
  select r.id, r.entrada into v_visita, v_entrada
    from public.registrar_entrada_visitante('  Ana   María Restrepo ', 'CC', '1.012.345.678', v_unidad, 'abc-123') r;
  assert (select nombre = 'Ana María Restrepo' and numero_documento = '1012345678' and placa = 'ABC123'
                 and unidad_id = v_unidad and entrada_por = v_perfil_vigilante and salida is null
            from public.visitas where id = v_visita),
    'FALLÓ 1: no guardó los datos normalizados';
  assert v_entrada = now(), 'FALLÓ 1: la hora de entrada no es la del servidor';
  v_n := v_n + 1;

  -- 2 · Nombre de 3 a 80 caracteres, solo letras y espacios → nombre_invalido.
  begin
    perform public.registrar_entrada_visitante('Lu', 'CC', '22222222', v_unidad);
    raise exception 'FALLÓ 2: aceptó un nombre de 2 caracteres';
  exception when others then
    if sqlerrm not like 'nombre_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante(repeat('a', 81), 'CC', '22222222', v_unidad);
    raise exception 'FALLÓ 2: aceptó un nombre de 81 caracteres';
  exception when others then
    if sqlerrm not like 'nombre_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Ana 2', 'CC', '22222222', v_unidad);
    raise exception 'FALLÓ 2: aceptó un nombre con números';
  exception when others then
    if sqlerrm not like 'nombre_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 3 · CC, CE y TI de 5 a 12 dígitos; pasaporte de 5 a 15 letras o números (MSG-RF10-04).
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'CC', '1234', v_unidad);
    raise exception 'FALLÓ 3: aceptó una CC de 4 dígitos';
  exception when others then
    if sqlerrm not like 'documento_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'TI', '1234567890123', v_unidad);
    raise exception 'FALLÓ 3: aceptó una TI de 13 dígitos';
  exception when others then
    if sqlerrm not like 'documento_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'CE', 'AB12345', v_unidad);
    raise exception 'FALLÓ 3: aceptó letras en una CE';
  exception when others then
    if sqlerrm not like 'documento_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'PASAPORTE', repeat('A', 16), v_unidad);
    raise exception 'FALLÓ 3: aceptó un pasaporte de 16 caracteres';
  exception when others then
    if sqlerrm not like 'documento_invalido%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', null, '22222222', v_unidad);
    raise exception 'FALLÓ 3: aceptó un tipo de documento vacío';
  exception when others then
    if sqlerrm not like 'documento_invalido%' then raise; end if;
  end;
  -- El pasaporte con letras se guarda en mayúsculas.
  perform public.registrar_entrada_visitante('John Smith', 'PASAPORTE', 'ab123456', v_unidad);
  assert exists (
    select 1 from public.visitas
     where conjunto_id = v_conjunto and numero_documento = 'AB123456' and tipo_documento = 'PASAPORTE'
  ),
    'FALLÓ 3: no guardó el pasaporte en mayúsculas';
  v_n := v_n + 1;

  -- 4 · La unidad es obligatoria y del mismo conjunto (MSG-RF10-05) → unidad_invalida.
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'CC', '22222222', null);
    raise exception 'FALLÓ 4: aceptó una visita sin unidad';
  exception when others then
    if sqlerrm not like 'unidad_invalida%' then raise; end if;
  end;
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'CC', '22222222', v_unidad_otra);
    raise exception 'FALLÓ 4: aceptó una unidad de otro conjunto';
  exception when others then
    if sqlerrm not like 'unidad_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 5 · Placa opcional AAA123 (carro) o AAA12A (moto) (MSG-RF10-06) → placa_invalida.
  begin
    perform public.registrar_entrada_visitante('Pedro Gómez', 'CC', '22222222', v_unidad, 'AB1234');
    raise exception 'FALLÓ 5: aceptó la placa AB1234';
  exception when others then
    if sqlerrm not like 'placa_invalida%' then raise; end if;
  end;
  select r.id into v_moto from public.registrar_entrada_visitante('Pedro Gómez', 'CC', '22222222', v_unidad, 'xyz12a') r;
  assert (select placa from public.visitas where id = v_moto) = 'XYZ12A', 'FALLÓ 5: no aceptó la placa de moto';
  perform public.registrar_entrada_visitante('Sin Vehículo', 'CC', '33333333', v_unidad, '  ');
  assert (select placa is null from public.visitas where numero_documento = '33333333'), 'FALLÓ 5: la placa vacía no quedó nula';
  v_n := v_n + 1;

  -- 6 · Un documento no puede tener dos entradas activas en el conjunto → ya_dentro.
  begin
    perform public.registrar_entrada_visitante('Ana María Restrepo', 'CC', '1012345678', v_unidad);
    raise exception 'FALLÓ 6: registró otra entrada de quien sigue dentro';
  exception when others then
    if sqlerrm not like 'ya_dentro%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 7 · Los intentos fallidos no dejaron visitas: hay 4 (Ana, John, Pedro y Sin Vehículo).
  select count(*) into v_cantidad from public.visitas where conjunto_id = v_conjunto;
  assert v_cantidad = 4, 'FALLÓ 7: se esperaban 4 visitas y hay ' || v_cantidad;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF10 · Consultas para la pantalla
  -- ------------------------------------------------------------------------------------------

  -- 8 · visitantes_dentro(): las 4 activas con su unidad.
  select count(*) into v_cantidad from public.visitantes_dentro();
  assert v_cantidad = 4, 'FALLÓ 8: se esperaban 4 visitantes dentro y hay ' || v_cantidad;
  assert (select d.unidad || '|' || d.placa from public.visitantes_dentro() d where d.id = v_visita) = 'RF10-101|ABC123',
    'FALLÓ 8: no trae la unidad y la placa';
  v_n := v_n + 1;

  -- 9 · unidades_visita(): solo las del conjunto.
  assert (select array_agg(u.nombre) from public.unidades_visita() u) = array['RF10-101'],
    'FALLÓ 9: no trae solo las unidades del conjunto';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF10 · registrar_salida_visitante()
  -- ------------------------------------------------------------------------------------------

  -- 10 · La salida guarda la hora del servidor y quién la registró (otro vigilante del conjunto).
  perform set_config('request.jwt.claims', json_build_object('sub', v_vigilante_2, 'role', 'authenticated')::text, true);
  select r.salida into v_salida from public.registrar_salida_visitante(v_visita) r;
  assert v_salida = now(), 'FALLÓ 10: la hora de salida no es la del servidor';
  assert (select salida = v_salida and salida_por = v_perfil_vigilante_2 from public.visitas where id = v_visita),
    'FALLÓ 10: no guardó la salida con quién la registró';
  assert not exists (select 1 from public.visitantes_dentro() d where d.id = v_visita), 'FALLÓ 10: sigue en «Visitantes dentro»';
  v_n := v_n + 1;

  -- 11 · No se registra una salida sin entrada activa (MSG-RF10-03) → sin_entrada_activa.
  begin
    perform public.registrar_salida_visitante(v_visita);
    raise exception 'FALLÓ 11: registró dos veces la salida';
  exception when others then
    if sqlerrm not like 'sin_entrada_activa%' then raise; end if;
  end;
  begin
    perform public.registrar_salida_visitante(gen_random_uuid());
    raise exception 'FALLÓ 11: registró la salida de una visita que no existe';
  exception when others then
    if sqlerrm not like 'sin_entrada_activa%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 12 · Después de salir, el visitante puede volver a entrar y su nombre se autocompleta.
  assert public.buscar_visitante('CC', '1.012.345.678') = 'Ana María Restrepo', 'FALLÓ 12: no autocompleta el nombre';
  assert public.buscar_visitante('CE', '1012345678') is null, 'FALLÓ 12: autocompletó con otro tipo de documento';
  perform public.registrar_entrada_visitante('Ana María Restrepo', 'CC', '1012345678', v_unidad);
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF10 · Permisos
  -- ------------------------------------------------------------------------------------------

  -- 13 · La vigilancia de otro conjunto no ve ni cierra las visitas de este.
  perform set_config('request.jwt.claims', json_build_object('sub', v_vigilante_otro, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.visitantes_dentro();
  assert v_cantidad = 0, 'FALLÓ 13: vio visitas de otro conjunto';
  assert public.buscar_visitante('CC', '1012345678') is null, 'FALLÓ 13: autocompletó con datos de otro conjunto';
  assert (select count(*) from public.unidades_visita() u where u.id = v_unidad) = 0, 'FALLÓ 13: ofreció una unidad de otro conjunto';
  begin
    perform public.registrar_salida_visitante(v_moto);
    raise exception 'FALLÓ 13: cerró una visita de otro conjunto';
  exception when others then
    if sqlerrm not like 'sin_entrada_activa%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 14 · Solo la vigilancia usa el registro de visitantes → sin_permiso.
  foreach v_texto in array array[v_residente::text, v_admin::text] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_texto, 'role', 'authenticated')::text, true);
    begin
      perform public.registrar_entrada_visitante('Pedro Gómez', 'CC', '44444444', v_unidad);
      raise exception 'FALLÓ 14: otro rol registró una entrada';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.registrar_salida_visitante(v_moto);
      raise exception 'FALLÓ 14: otro rol registró una salida';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.visitantes_dentro();
      raise exception 'FALLÓ 14: otro rol listó los visitantes dentro';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.buscar_visitante('CC', '1012345678');
      raise exception 'FALLÓ 14: otro rol buscó un visitante';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.unidades_visita();
      raise exception 'FALLÓ 14: otro rol listó las unidades para visitas';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
  end loop;
  v_n := v_n + 1;

  -- 15 · La tabla tiene Row Level Security, solo la vigilancia la lee y no hay escrituras directas.
  assert (select relrowsecurity from pg_class where oid = 'public.visitas'::regclass), 'FALLÓ 15: visitas sin RLS';
  assert not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'visitas' and cmd <> 'SELECT'
  ), 'FALLÓ 15: hay políticas de escritura directa';
  assert (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'visitas' and qual like '%vigilancia%') = 1,
    'FALLÓ 15: la política de lectura no es solo para la vigilancia';
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF10 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
