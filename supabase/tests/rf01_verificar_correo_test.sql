-- =============================================================================================
-- Convive · Pruebas de base de datos del RF01 (verificar el correo antes de crear la contraseña)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) el conjunto, el perfil y el usuario de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF01 OK: 6 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- Requiere: 20261003000000_autenticacion.sql y 20261016000000_verificar_correo.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_unidad uuid;
  v_usuario uuid := gen_random_uuid();
  v_email text := 'prueba.rf01@convive.test';
  v_n integer := 0;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF01', 'Cali') returning id into v_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'T01') returning id into v_unidad;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol)
  values (v_conjunto, v_unidad, v_email, 'Prueba RF01', 'residente');

  -- 1 · Pre-registrado sin usuario de Auth
  if public.estado_correo(v_email) <> 'pending' then
    raise exception 'FALLÓ 1: un correo pre-registrado sin usuario no quedó «pending»';
  end if;
  v_n := v_n + 1;

  -- 2 · Pidió el código: signInWithOtp crea el usuario sin contraseña ni correo verificado
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values (v_usuario, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, '', null, now(), now());
  if not exists (select 1 from public.perfiles where email = v_email and user_id = v_usuario) then
    raise exception 'FALLÓ 2: el trigger vincular_perfil no enlazó el perfil';
  end if;
  if public.estado_correo(v_email) <> 'pending' then
    raise exception 'FALLÓ 2: pedir el código dejó la cuenta «registered»';
  end if;
  v_n := v_n + 1;

  -- 3 · Alguien llamó signUp con el correo ajeno: tiene contraseña pero el correo no está verificado
  update auth.users set encrypted_password = 'hash-de-prueba' where id = v_usuario;
  if public.estado_correo(v_email) <> 'pending' then
    raise exception 'FALLÓ 3: una contraseña sin correo verificado dejó la cuenta «registered»';
  end if;
  v_n := v_n + 1;

  -- 4 · Verificó el código pero aún no guarda la contraseña
  update auth.users set encrypted_password = '', email_confirmed_at = now() where id = v_usuario;
  if public.estado_correo(v_email) <> 'pending' then
    raise exception 'FALLÓ 4: un correo verificado sin contraseña quedó «registered»';
  end if;
  v_n := v_n + 1;

  -- 5 · Correo verificado y con contraseña
  update auth.users set encrypted_password = 'hash-de-prueba' where id = v_usuario;
  if public.estado_correo(' PRUEBA.RF01@convive.test ') <> 'registered' then
    raise exception 'FALLÓ 5: un correo verificado con contraseña no quedó «registered»';
  end if;
  v_n := v_n + 1;

  -- 6 · Correo que la administración no registró
  if public.estado_correo('nadie.rf01@convive.test') <> 'not_found' then
    raise exception 'FALLÓ 6: un correo sin perfil no quedó «not_found»';
  end if;
  v_n := v_n + 1;

  raise exception 'RF01 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
