-- =============================================================================================
-- Convive · Pruebas de base de datos del Panel del administrador (resumen_panel)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) todo.
--   · Si todo pasa, el resultado es el «error»:  PANEL OK: 4 pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261130000000_panel_administrador.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro uuid;
  v_u1 uuid;
  v_u2 uuid;
  v_u3 uuid;
  v_u_otro uuid;
  v_admin uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_perfil_residente uuid;
  v_fila record;
  v_n integer := 0;
begin
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba Panel', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto Panel', 'Cali') returning id into v_otro;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'P-101') returning id into v_u1;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'P-102') returning id into v_u2;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'P-103') returning id into v_u3;
  insert into public.unidades (conjunto_id, nombre) values (v_otro, 'O-101') returning id into v_u_otro;
  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'admin.panel@convive.test', 'Admin Panel', 'administrador'),
    (v_conjunto, v_u1, 'residente.panel@convive.test', 'Residente Panel', 'residente');
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.panel@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.panel@convive.test');
  select id into v_perfil_residente from public.perfiles where user_id = v_residente;

  -- P-101 debe dos conceptos; P-102 está al día (saldo 0); P-103 no tiene filas en la cartera.
  -- La unidad del otro conjunto también debe: no debe sumarse.
  insert into public.cartera (unidad_id, concepto_id, saldo) values
    (v_u1, 'administracion', 35000),
    (v_u1, 'otros', 10678.90),
    (v_u2, 'administracion', 0),
    (v_u_otro, 'administracion', 999999);

  -- Dos PQRS pendientes y una en proceso en el conjunto; una pendiente en el otro conjunto.
  insert into public.pqrs (conjunto_id, radicado, radicado_por, unidad_id, tipo, descripcion, estado) values
    (v_conjunto, 1, v_perfil_residente, v_u1, 'queja', 'Ruido excesivo en la zona común después de las diez', 'pendiente'),
    (v_conjunto, 2, v_perfil_residente, v_u1, 'peticion', 'Solicito revisar la iluminación del parqueadero norte', 'pendiente'),
    (v_conjunto, 3, v_perfil_residente, v_u1, 'reclamo', 'El portón eléctrico no cierra bien desde la semana pasada', 'en_proceso'),
    (v_otro, 1, v_perfil_residente, v_u_otro, 'queja', 'Esta PQRS es de otro conjunto y no debe contarse aquí', 'pendiente');

  -- 1 · El administrador ve la cartera de su conjunto y cuántas unidades deben
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select * into v_fila from public.resumen_panel();
  if v_fila.cartera <> 45678.90 then
    raise exception 'FALLÓ 1: la cartera es % (esperaba 45678.90)', v_fila.cartera;
  end if;
  if v_fila.unidades_en_mora <> 1 or v_fila.total_unidades <> 3 then
    raise exception 'FALLÓ 1: % de % unidades en mora (esperaba 1 de 3)', v_fila.unidades_en_mora, v_fila.total_unidades;
  end if;
  v_n := v_n + 1;

  -- 2 · Solo cuenta las PQRS pendientes de su conjunto
  if v_fila.pqrs_pendientes <> 2 then
    raise exception 'FALLÓ 2: % PQRS pendientes (esperaba 2)', v_fila.pqrs_pendientes;
  end if;
  v_n := v_n + 1;

  -- 3 · Un pago que deja la unidad al día la saca de la mora
  update public.cartera set saldo = 0 where unidad_id = v_u1;
  select * into v_fila from public.resumen_panel();
  if v_fila.cartera <> 0 or v_fila.unidades_en_mora <> 0 then
    raise exception 'FALLÓ 3: quedó cartera % con % unidades en mora', v_fila.cartera, v_fila.unidades_en_mora;
  end if;
  v_n := v_n + 1;

  -- 4 · Otros roles no pueden consultar el panel
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  begin
    perform public.resumen_panel();
    raise exception 'FALLÓ 4: un residente consultó el panel';
  exception when others then
    if sqlerrm <> 'sin_permiso' then raise; end if;
  end;
  if has_function_privilege('anon', 'public.resumen_panel()', 'execute') then
    raise exception 'FALLÓ 4: anon puede ejecutar resumen_panel()';
  end if;
  v_n := v_n + 1;

  raise exception 'PANEL OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
