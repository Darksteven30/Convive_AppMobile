-- =============================================================================================
-- Convive · Pruebas de base de datos de RF20 (administración de usuarios y unidades)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, unidades y personas de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF20 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261003000000_autenticacion.sql y 20261120000000_usuarios_unidades.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_unidad_otra uuid;
  v_nueva uuid;
  v_admin uuid := gen_random_uuid();
  v_admin_otro uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_nuevo_usuario uuid := gen_random_uuid();
  v_perfil_admin uuid;
  v_perfil_residente uuid;
  v_persona uuid;
  v_texto text;
  v_cantidad integer;
  v_usuario uuid;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero un administrador y un residente con cuenta
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF20', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF20', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF20-101') returning id into v_unidad;
  insert into public.unidades (conjunto_id, nombre) values (v_otro_conjunto, 'RF20-OTRA') returning id into v_unidad_otra;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'admin.rf20@convive.test', 'Admin RF20', 'administrador'),
    (v_conjunto, v_unidad, 'residente.rf20@convive.test', 'Residente RF20', 'residente'),
    (v_otro_conjunto, null, 'admin.otro.rf20@convive.test', 'Admin otro RF20', 'administrador');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf20@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf20@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin_otro, 'authenticated', 'authenticated', 'admin.otro.rf20@convive.test');

  select id into v_perfil_admin from public.perfiles where user_id = v_admin;
  select id into v_perfil_residente from public.perfiles where user_id = v_residente;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------------------------------------
  -- RF20 · Unidades
  -- ------------------------------------------------------------------------------------------

  -- 1 · Crea la unidad sin espacios de sobra y en el conjunto de la sesión.
  select r.id into v_nueva from public.guardar_unidad(null, '  Torre 2 ·   301 ', '  Apartamento 301 ') r;
  assert (select nombre = 'Torre 2 · 301' and direccion = 'Apartamento 301' and conjunto_id = v_conjunto
            from public.unidades where id = v_nueva),
    'FALLÓ 1: no guardó la unidad normalizada';
  v_n := v_n + 1;

  -- 2 · El nombre no se repite en el conjunto, sin importar mayúsculas → unidad_duplicada.
  begin
    perform public.guardar_unidad(null, 'torre 2 · 301', null);
    raise exception 'FALLÓ 2: aceptó una unidad repetida';
  exception when others then
    if sqlerrm not like 'unidad_duplicada%' then raise; end if;
  end;
  -- En otro conjunto sí puede existir el mismo nombre.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  perform public.guardar_unidad(null, 'Torre 2 · 301', null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_n := v_n + 1;

  -- 3 · Nombre de 1 a 40 caracteres y dirección de hasta 120.
  begin
    perform public.guardar_unidad(null, '   ', null);
    raise exception 'FALLÓ 3: aceptó una unidad sin nombre';
  exception when others then
    if sqlerrm not like 'nombre_unidad_invalido%' then raise; end if;
  end;
  begin
    perform public.guardar_unidad(null, 'RF20-102', repeat('a', 121));
    raise exception 'FALLÓ 3: aceptó una dirección de 121 caracteres';
  exception when others then
    if sqlerrm not like 'direccion_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 4 · Edita su unidad; la de otro conjunto → no_encontrada.
  perform public.guardar_unidad(v_nueva, 'Torre 2 · 302', null);
  assert (select nombre = 'Torre 2 · 302' and direccion is null from public.unidades where id = v_nueva),
    'FALLÓ 4: no editó la unidad';
  begin
    perform public.guardar_unidad(v_unidad_otra, 'Ajena', null);
    raise exception 'FALLÓ 4: editó una unidad de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 5 · Lista solo las unidades del conjunto, con cuántas personas tiene cada una.
  select count(*) into v_cantidad from public.unidades_admin();
  assert v_cantidad = 2, format('FALLÓ 5: se esperaban 2 unidades y hay %s', v_cantidad);
  assert (select personas = 1 from public.unidades_admin() where nombre = 'RF20-101'), 'FALLÓ 5: no contó las personas';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF20 · Personas
  -- ------------------------------------------------------------------------------------------

  -- 6 · Pre-registra con el correo en minúsculas y sin cuenta; al crear su usuario, queda enlazado.
  select r.id into v_persona
    from public.preregistrar_usuario('  Nuevo.RF20@Convive.test ', '  Persona   Nueva ', 'residente', v_unidad, '320 111 2233') r;
  assert (select email = 'nuevo.rf20@convive.test' and nombre = 'Persona Nueva' and telefono = '3201112233'
                 and conjunto_id = v_conjunto and user_id is null
            from public.perfiles where id = v_persona),
    'FALLÓ 6: no guardó el pre-registro normalizado';
  assert public.estado_correo('nuevo.rf20@convive.test') = 'pending', 'FALLÓ 6: el correo no quedó pre-registrado';
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_nuevo_usuario, 'authenticated', 'authenticated', 'nuevo.rf20@convive.test');
  assert (select tiene_cuenta from public.usuarios_conjunto() where id = v_persona), 'FALLÓ 6: no se enlazó con su cuenta';
  v_n := v_n + 1;

  -- 7 · Validaciones de la persona.
  begin
    perform public.preregistrar_usuario('sin-arroba', 'Persona Válida', 'residente', v_unidad);
    raise exception 'FALLÓ 7: aceptó un correo inválido';
  exception when others then
    if sqlerrm not like 'correo_invalido%' then raise; end if;
  end;
  begin
    perform public.preregistrar_usuario('a.rf20@convive.test', 'Lu', 'residente', v_unidad);
    raise exception 'FALLÓ 7: aceptó un nombre de 2 caracteres';
  exception when others then
    if sqlerrm not like 'nombre_invalido%' then raise; end if;
  end;
  begin
    perform public.preregistrar_usuario('a.rf20@convive.test', 'Persona Válida', 'residente', v_unidad, '1234567890');
    raise exception 'FALLÓ 7: aceptó un teléfono que no empieza por 3';
  exception when others then
    if sqlerrm not like 'telefono_invalido%' then raise; end if;
  end;
  begin
    perform public.preregistrar_usuario('a.rf20@convive.test', 'Persona Válida', 'residente', null);
    raise exception 'FALLÓ 7: aceptó un residente sin unidad';
  exception when others then
    if sqlerrm not like 'unidad_requerida%' then raise; end if;
  end;
  begin
    perform public.preregistrar_usuario('a.rf20@convive.test', 'Persona Válida', 'residente', v_unidad_otra);
    raise exception 'FALLÓ 7: aceptó una unidad de otro conjunto';
  exception when others then
    if sqlerrm not like 'unidad_requerida%' then raise; end if;
  end;
  -- La vigilancia puede quedar sin unidad.
  perform public.preregistrar_usuario('porteria.rf20@convive.test', 'Portero RF20', 'vigilancia', null);
  v_n := v_n + 1;

  -- 8 · El correo es único en toda la app (también frente a otro conjunto) → correo_duplicado.
  foreach v_texto in array array['RESIDENTE.rf20@convive.test', 'admin.otro.rf20@convive.test'] loop
    begin
      perform public.preregistrar_usuario(v_texto, 'Persona Repetida', 'residente', v_unidad);
      raise exception 'FALLÓ 8: aceptó el correo repetido %', v_texto;
    exception when others then
      if sqlerrm not like 'correo_duplicado%' then raise; end if;
    end;
  end loop;
  v_n := v_n + 1;

  -- 9 · Edita los datos; el correo solo mientras no tenga cuenta → correo_bloqueado.
  select r.id into v_persona from public.preregistrar_usuario('pendiente.rf20@convive.test', 'Pendiente RF20', 'residente', v_unidad) r;
  perform public.editar_usuario(v_persona, 'cambiado.rf20@convive.test', 'Pendiente RF20', 'junta_directiva', v_unidad);
  assert (select email = 'cambiado.rf20@convive.test' and rol = 'junta_directiva' from public.perfiles where id = v_persona),
    'FALLÓ 9: no editó el pre-registro';
  perform public.editar_usuario(v_perfil_residente, 'residente.rf20@convive.test', 'Residente Editado', 'residente', v_nueva);
  assert (select nombre = 'Residente Editado' and unidad_id = v_nueva from public.perfiles where id = v_perfil_residente),
    'FALLÓ 9: no editó a quien tiene cuenta';
  begin
    perform public.editar_usuario(v_perfil_residente, 'otro.rf20@convive.test', 'Residente Editado', 'residente', v_nueva);
    raise exception 'FALLÓ 9: cambió el correo de quien ya tiene cuenta';
  exception when others then
    if sqlerrm not like 'correo_bloqueado%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 10 · El administrador no cambia su propio rol → rol_propio; sí el de otra persona.
  begin
    perform public.editar_usuario(v_perfil_admin, 'admin.rf20@convive.test', 'Admin RF20', 'residente', v_unidad);
    raise exception 'FALLÓ 10: el administrador cambió su propio rol';
  exception when others then
    if sqlerrm not like 'rol_propio%' then raise; end if;
  end;
  perform public.editar_usuario(v_perfil_residente, 'residente.rf20@convive.test', 'Residente Editado', 'administrador', null);
  assert (select rol = 'administrador' from public.perfiles where id = v_perfil_residente), 'FALLÓ 10: no cambió el rol';
  v_n := v_n + 1;

  -- 11 · Elimina un pre-registro, pero no a quien ya tiene cuenta ni de otro conjunto.
  perform public.eliminar_preregistro(v_persona);
  assert not exists (select 1 from public.perfiles where id = v_persona), 'FALLÓ 11: no eliminó el pre-registro';
  begin
    perform public.eliminar_preregistro(v_perfil_admin);
    raise exception 'FALLÓ 11: eliminó a quien tiene cuenta';
  exception when others then
    if sqlerrm not like 'usuario_con_cuenta%' then raise; end if;
  end;
  begin
    perform public.eliminar_preregistro((select id from public.perfiles where email = 'admin.otro.rf20@convive.test'));
    raise exception 'FALLÓ 11: eliminó a alguien de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 12 · Cada administrador ve solo a las personas de su conjunto.
  assert not exists (select 1 from public.usuarios_conjunto() where email = 'admin.otro.rf20@convive.test'),
    'FALLÓ 12: ve personas de otro conjunto';
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.usuarios_conjunto();
  assert v_cantidad = 1, format('FALLÓ 12: el otro conjunto debería tener 1 persona y tiene %s', v_cantidad);
  v_n := v_n + 1;

  -- 13 · Quien no es administrador no usa ninguna función → sin_permiso.
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol)
  values (v_conjunto, v_unidad, 'vecino.rf20@convive.test', 'Vecino RF20', 'residente');
  v_usuario := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', v_usuario, 'authenticated', 'authenticated', 'vecino.rf20@convive.test');
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  begin
    perform public.unidades_admin();
    raise exception 'FALLÓ 13: un residente listó las unidades';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.guardar_unidad(null, 'RF20-999', null);
    raise exception 'FALLÓ 13: un residente creó una unidad';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.usuarios_conjunto();
    raise exception 'FALLÓ 13: un residente listó a las personas';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.preregistrar_usuario('x.rf20@convive.test', 'Persona Válida', 'residente', v_unidad);
    raise exception 'FALLÓ 13: un residente pre-registró a alguien';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.editar_usuario(v_perfil_admin, 'admin.rf20@convive.test', 'Admin RF20', 'residente', v_unidad);
    raise exception 'FALLÓ 13: un residente editó a alguien';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  begin
    perform public.eliminar_preregistro(v_perfil_admin);
    raise exception 'FALLÓ 13: un residente eliminó a alguien';
  exception when others then
    if sqlerrm not like 'sin_permiso%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF20 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
