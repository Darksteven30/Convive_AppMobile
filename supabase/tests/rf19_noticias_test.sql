-- =============================================================================================
-- Convive · Pruebas de base de datos de RF19 (noticias y comunicados)
--
-- Cómo ejecutarlas: Supabase → SQL Editor → pegar este archivo → Run.
-- No dejan datos: todo corre dentro de un bloque que termina con un error a propósito, así
-- PostgreSQL deshace (rollback) los conjuntos, usuarios y comunicados de prueba.
--   · Si todo pasa, el resultado es el «error»:  RF19 OK: N pruebas pasaron (se deshicieron los datos de prueba).
--   · Si algo falla, el error dice qué prueba falló.
-- La sesión se simula con request.jwt.claims, que es lo que lee auth.uid().
-- Requiere: 20261003000000_autenticacion.sql, 20261022000000_pqrs.sql, 20261102000000_noticias.sql y
-- 20261103000000_vigencia_noticias.sql.
-- =============================================================================================

do $$
declare
  v_conjunto uuid;
  v_otro_conjunto uuid;
  v_unidad uuid;
  v_admin uuid := gen_random_uuid();
  v_admin_otro uuid := gen_random_uuid();
  v_residente uuid := gen_random_uuid();
  v_junta uuid := gen_random_uuid();
  v_vigilante uuid := gen_random_uuid();
  v_residente_otro uuid := gen_random_uuid();
  v_perfil_admin uuid;
  v_noticia uuid;
  v_antigua uuid;
  v_creada timestamptz;
  v_texto text;
  v_titulos text[];
  v_cantidad integer;
  v_usuario uuid;
  v_n integer := 0;
begin
  -- ------------------------------------------------------------------------------------------
  -- Datos de prueba: dos conjuntos; en el primero un administrador, un residente, la junta y la
  -- vigilancia; en el segundo un administrador y un residente
  -- ------------------------------------------------------------------------------------------
  insert into public.conjuntos (nombre, ciudad) values ('Conjunto de prueba RF19', 'Cali') returning id into v_conjunto;
  insert into public.conjuntos (nombre, ciudad) values ('Otro conjunto RF19', 'Cali') returning id into v_otro_conjunto;
  insert into public.unidades (conjunto_id, nombre) values (v_conjunto, 'RF19-101') returning id into v_unidad;

  insert into public.perfiles (conjunto_id, unidad_id, email, nombre, rol) values
    (v_conjunto, null, 'admin.rf19@convive.test', 'Admin RF19', 'administrador'),
    (v_conjunto, v_unidad, 'residente.rf19@convive.test', 'Residente RF19', 'residente'),
    (v_conjunto, null, 'junta.rf19@convive.test', 'Junta RF19', 'junta_directiva'),
    (v_conjunto, null, 'vigilante.rf19@convive.test', 'Vigilante RF19', 'vigilancia'),
    (v_otro_conjunto, null, 'admin.otro.rf19@convive.test', 'Admin otro RF19', 'administrador'),
    (v_otro_conjunto, null, 'residente.otro.rf19@convive.test', 'Residente otro RF19', 'residente');

  -- Al crear el usuario de Auth, el trigger vincular_perfil lo enlaza con su perfil.
  insert into auth.users (instance_id, id, aud, role, email) values
    ('00000000-0000-0000-0000-000000000000', v_admin, 'authenticated', 'authenticated', 'admin.rf19@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente, 'authenticated', 'authenticated', 'residente.rf19@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_junta, 'authenticated', 'authenticated', 'junta.rf19@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_vigilante, 'authenticated', 'authenticated', 'vigilante.rf19@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_admin_otro, 'authenticated', 'authenticated', 'admin.otro.rf19@convive.test'),
    ('00000000-0000-0000-0000-000000000000', v_residente_otro, 'authenticated', 'authenticated', 'residente.otro.rf19@convive.test');

  select id into v_perfil_admin from public.perfiles where user_id = v_admin;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ------------------------------------------------------------------------------------------
  -- RF19 · publicar_noticia()
  -- ------------------------------------------------------------------------------------------

  -- 1 · Publica sin espacios de sobra, con la hora del servidor y quién lo publicó.
  select r.id, r.created_at, r.publicada_por into v_noticia, v_creada, v_texto
    from public.publicar_noticia('  Corte de agua programado ', ' Mañana no habrá agua de 8:00 a 10:00 a. m. ') r;
  assert (select titulo = 'Corte de agua programado' and cuerpo = 'Mañana no habrá agua de 8:00 a 10:00 a. m.'
                 and conjunto_id = v_conjunto and publicada_por = v_perfil_admin
                 and editada_por is null and updated_at is null
            from public.noticias where id = v_noticia),
    'FALLÓ 1: no guardó el comunicado normalizado';
  assert v_creada = now(), 'FALLÓ 1: la hora de publicación no es la del servidor';
  assert v_texto = 'Admin RF19', 'FALLÓ 1: no devolvió quién lo publicó';
  v_n := v_n + 1;

  -- 2 · Crea el aviso «Nuevo comunicado» para las demás personas del conjunto, no para quien publica
  --     ni para otro conjunto.
  select count(*) into v_cantidad
    from public.notificaciones x
    join public.perfiles p on p.id = x.perfil_id
   where x.tipo = 'noticia_nueva' and x.referencia_id = v_noticia
     and x.titulo = 'Nuevo comunicado' and x.mensaje = 'Corte de agua programado'
     and p.conjunto_id = v_conjunto and p.id <> v_perfil_admin;
  assert v_cantidad = 3, format('FALLÓ 2: se esperaban 3 avisos y hay %s', v_cantidad);
  assert (select count(*) from public.notificaciones where referencia_id = v_noticia) = 3,
    'FALLÓ 2: avisó a quien publicó o a otro conjunto';
  v_n := v_n + 1;

  -- 3 · Título de 5 a 60 caracteres → titulo_invalido.
  foreach v_texto in array array['Agua', '     ', repeat('a', 61)] loop
    begin
      perform public.publicar_noticia(v_texto, 'Mensaje con más de diez caracteres.');
      raise exception 'FALLÓ 3: aceptó el título «%»', v_texto;
    exception when others then
      if sqlerrm not like 'titulo_invalido%' then raise; end if;
    end;
  end loop;
  -- 60 caracteres sí (con tilde, cada letra cuenta una).
  perform public.publicar_noticia(repeat('á', 60), 'Mensaje con más de diez caracteres.');
  v_n := v_n + 1;

  -- 4 · Mensaje de 10 a 2.000 caracteres → cuerpo_invalido.
  foreach v_texto in array array['Corto', '   Corto   ', repeat('a', 2001)] loop
    begin
      perform public.publicar_noticia('Título válido', v_texto);
      raise exception 'FALLÓ 4: aceptó un mensaje de % caracteres', char_length(v_texto);
    exception when others then
      if sqlerrm not like 'cuerpo_invalido%' then raise; end if;
    end;
  end loop;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF19 · Consultar
  -- ------------------------------------------------------------------------------------------

  -- Un comunicado más antiguo, para verificar el orden.
  insert into public.noticias (conjunto_id, titulo, cuerpo, publicada_por, created_at)
  values (v_conjunto, 'Asamblea general', 'La asamblea será el sábado a las 9:00 a. m.', v_perfil_admin, now() - interval '3 days')
  returning id into v_antigua;
  delete from public.noticias where conjunto_id = v_conjunto and titulo = repeat('á', 60);

  -- 5 · Todos los roles del conjunto leen sus comunicados, del más reciente al más antiguo.
  foreach v_usuario in array array[v_residente, v_junta, v_vigilante, v_admin] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    select array_agg(n.titulo order by n.created_at desc) into v_titulos from public.noticias_conjunto() n;
    assert v_titulos = array['Corte de agua programado', 'Asamblea general'],
      format('FALLÓ 5: lista inesperada %s', v_titulos);
  end loop;
  v_n := v_n + 1;

  -- 6 · p_limite devuelve solo los más recientes (para «Últimas noticias» de Inicio).
  select array_agg(n.titulo) into v_titulos from public.noticias_conjunto(1) n;
  assert v_titulos = array['Corte de agua programado'], format('FALLÓ 6: el límite devolvió %s', v_titulos);
  v_n := v_n + 1;

  -- 7 · El detalle trae el comunicado con quién lo publicó.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  select d.publicada_por into v_texto from public.detalle_noticia(v_antigua) d;
  assert v_texto = 'Admin RF19', 'FALLÓ 7: el detalle no trajo quién lo publicó';
  v_n := v_n + 1;

  -- 8 · Otro conjunto no ve los comunicados: lista vacía y no_encontrada en el detalle.
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente_otro, 'role', 'authenticated')::text, true);
  assert not exists (select 1 from public.noticias_conjunto()), 'FALLÓ 8: otro conjunto ve los comunicados';
  begin
    perform public.detalle_noticia(v_noticia);
    raise exception 'FALLÓ 8: otro conjunto abrió el detalle';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF19 · editar_noticia() y eliminar_noticia()
  -- ------------------------------------------------------------------------------------------

  -- 9 · Editar guarda los textos, quién y cuándo lo editó, y actualiza el aviso pendiente.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.editar_noticia(v_noticia, ' Corte de agua ', 'Será de 9:00 a 11:00 a. m.');
  assert (select titulo = 'Corte de agua' and cuerpo = 'Será de 9:00 a 11:00 a. m.'
                 and editada_por = v_perfil_admin and updated_at = now() and created_at = v_creada
            from public.noticias where id = v_noticia),
    'FALLÓ 9: no guardó la edición';
  assert not exists (
    select 1 from public.notificaciones where referencia_id = v_noticia and mensaje <> 'Corte de agua'
  ), 'FALLÓ 9: el aviso no muestra el título nuevo';
  begin
    perform public.editar_noticia(v_noticia, 'Agua', 'Será de 9:00 a 11:00 a. m.');
    raise exception 'FALLÓ 9: la edición aceptó un título inválido';
  exception when others then
    if sqlerrm not like 'titulo_invalido%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 10 · El administrador de otro conjunto no puede editar ni eliminar → no_encontrada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_otro, 'role', 'authenticated')::text, true);
  begin
    perform public.editar_noticia(v_noticia, 'Título ajeno', 'Mensaje de otro conjunto.');
    raise exception 'FALLÓ 10: editó un comunicado de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  begin
    perform public.eliminar_noticia(v_noticia);
    raise exception 'FALLÓ 10: eliminó un comunicado de otro conjunto';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  assert exists (select 1 from public.noticias where id = v_noticia), 'FALLÓ 10: el comunicado cambió';
  v_n := v_n + 1;

  -- 11 · Residente, junta y vigilancia no publican, editan ni eliminan → sin_permiso.
  foreach v_usuario in array array[v_residente, v_junta, v_vigilante] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
    begin
      perform public.publicar_noticia('Título válido', 'Mensaje con más de diez caracteres.');
      raise exception 'FALLÓ 11: otro rol publicó';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.editar_noticia(v_noticia, 'Título válido', 'Mensaje con más de diez caracteres.');
      raise exception 'FALLÓ 11: otro rol editó';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
    begin
      perform public.eliminar_noticia(v_noticia);
      raise exception 'FALLÓ 11: otro rol eliminó';
    exception when others then
      if sqlerrm not like 'sin_permiso%' then raise; end if;
    end;
  end loop;
  v_n := v_n + 1;

  -- 12 · Eliminar borra el comunicado y sus avisos; eliminarlo otra vez → no_encontrada.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.eliminar_noticia(v_noticia);
  assert not exists (select 1 from public.noticias where id = v_noticia), 'FALLÓ 12: no eliminó el comunicado';
  assert not exists (select 1 from public.notificaciones where referencia_id = v_noticia), 'FALLÓ 12: quedaron avisos';
  begin
    perform public.eliminar_noticia(v_noticia);
    raise exception 'FALLÓ 12: eliminó dos veces el mismo comunicado';
  exception when others then
    if sqlerrm not like 'no_encontrada%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 13 · La tabla tiene Row Level Security, lectura por conjunto y no hay escrituras directas.
  assert (select relrowsecurity from pg_class where oid = 'public.noticias'::regclass), 'FALLÓ 13: noticias sin RLS';
  assert not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'noticias' and cmd <> 'SELECT'
  ), 'FALLÓ 13: hay políticas de escritura directa';
  assert (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'noticias' and qual like '%mi_conjunto()%') = 1,
    'FALLÓ 13: la política de lectura no filtra por conjunto';
  v_n := v_n + 1;

  -- ------------------------------------------------------------------------------------------
  -- RF19 · Vigencia («visible hasta», 20261103000000_vigencia_noticias.sql)
  -- ------------------------------------------------------------------------------------------

  -- 14 · «Visible hasta» debe ser posterior a este momento → vigencia_invalida.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  begin
    perform public.publicar_noticia('Piscina cerrada', 'La piscina estará cerrada el sábado.', now());
    raise exception 'FALLÓ 14: aceptó una vigencia que no es futura';
  exception when others then
    if sqlerrm not like 'vigencia_invalida%' then raise; end if;
  end;
  begin
    perform public.editar_noticia(v_antigua, 'Asamblea general', 'La asamblea será el sábado a las 9:00 a. m.', now() - interval '1 hour');
    raise exception 'FALLÓ 14: la edición aceptó una vigencia pasada';
  exception when others then
    if sqlerrm not like 'vigencia_invalida%' then raise; end if;
  end;
  v_n := v_n + 1;

  -- 15 · Un comunicado vigente sale en Inicio; uno vencido no, pero sigue en el histórico y en el detalle.
  select r.id into v_noticia
    from public.publicar_noticia('Piscina cerrada', 'La piscina estará cerrada el sábado.', now() + interval '2 days') r;
  assert (select visible_hasta = now() + interval '2 days' from public.noticias where id = v_noticia),
    'FALLÓ 15: no guardó «visible hasta»';
  -- Simula que ya pasó la fecha (la tabla exige que sea posterior a la publicación).
  update public.noticias set created_at = now() - interval '3 days', visible_hasta = now() - interval '1 minute'
   where id = v_antigua;
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  select array_agg(n.titulo order by n.created_at desc) into v_titulos from public.noticias_conjunto(null, true) n;
  assert v_titulos = array['Piscina cerrada'], format('FALLÓ 15: los vigentes son %s', v_titulos);
  select array_agg(n.titulo order by n.created_at desc) into v_titulos from public.noticias_conjunto() n;
  assert v_titulos = array['Piscina cerrada', 'Asamblea general'], format('FALLÓ 15: el histórico es %s', v_titulos);
  assert (select d.visible_hasta < now() from public.detalle_noticia(v_antigua) d), 'FALLÓ 15: el detalle no abre el vencido';
  v_n := v_n + 1;

  -- 16 · Al editar se puede quitar «visible hasta»: el comunicado vencido vuelve a Inicio.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.editar_noticia(v_antigua, 'Asamblea general', 'La asamblea será el sábado a las 9:00 a. m.', null);
  perform set_config('request.jwt.claims', json_build_object('sub', v_residente, 'role', 'authenticated')::text, true);
  select count(*) into v_cantidad from public.noticias_conjunto(null, true);
  assert v_cantidad = 2, format('FALLÓ 16: se esperaban 2 vigentes y hay %s', v_cantidad);
  v_n := v_n + 1;

  -- Todo pasó: este error es a propósito para deshacer los datos de prueba.
  raise exception 'RF19 OK: % pruebas pasaron (se deshicieron los datos de prueba).', v_n;
end;
$$;
