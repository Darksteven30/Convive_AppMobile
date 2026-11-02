-- =============================================================================================
-- Convive · Vigencia de los comunicados (RF19, propuesto)
--
-- Un comunicado puede tener «visible hasta» (fecha y hora, opcional): por ejemplo, «la piscina
-- estará en mantenimiento este fin de semana» deja de interesar el lunes. Cuando pasa esa hora,
-- el comunicado sale solo de «Últimas noticias» de Inicio, sin que nadie tenga que eliminarlo,
-- pero no se borra: cualquier persona del conjunto lo sigue viendo en «Histórico de noticias».
-- Sin «visible hasta», el comunicado no vence.
--
-- Regla: «visible hasta» debe ser posterior al momento de publicar o editar (vigencia_invalida).
--
-- Requiere: 20261102000000_noticias.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

alter table public.noticias add column visible_hasta timestamptz;
alter table public.noticias add constraint noticias_visible_hasta_check
  check (visible_hasta is null or visible_hasta > created_at);

-- Las funciones cambian de parámetros o de columnas, así que se reemplazan.
drop function public.noticias_conjunto(integer);
drop function public.detalle_noticia(uuid);
drop function public.publicar_noticia(text, text);
drop function public.editar_noticia(uuid, text, text);

-- ---------------------------------------------------------------------------------------------
-- RF19 · Consultar
-- ---------------------------------------------------------------------------------------------

-- Comunicados del conjunto, del más reciente al más antiguo, con quién los publicó.
-- p_solo_vigentes: solo los que no han vencido («Últimas noticias» de Inicio); sin él, todos
-- («Histórico de noticias» y la lista del administrador). p_limite (opcional) es para Inicio.
create or replace function public.noticias_conjunto(p_limite integer default null, p_solo_vigentes boolean default false)
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  publicada_por text,
  created_at timestamptz,
  updated_at timestamptz,
  visible_hasta timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at, n.visible_hasta
    from public.noticias n
    join public.perfiles p on p.id = n.publicada_por
   where n.conjunto_id = public.mi_conjunto()
     and (not coalesce(p_solo_vigentes, false) or n.visible_hasta is null or n.visible_hasta > now())
   order by n.created_at desc
   limit p_limite;
$$;

-- Un comunicado del conjunto, vigente o vencido (se abre desde el histórico).
-- Error: no_encontrada (no existe o es de otro conjunto).
create or replace function public.detalle_noticia(p_id uuid)
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  publicada_por text,
  created_at timestamptz,
  updated_at timestamptz,
  visible_hasta timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at, n.visible_hasta
      from public.noticias n
      join public.perfiles p on p.id = n.publicada_por
     where n.id = p_id and n.conjunto_id = public.mi_conjunto();
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF19 · Publicar y editar (administrador)
-- ---------------------------------------------------------------------------------------------

-- Igual que en 20261102000000_noticias.sql, con «visible hasta» opcional.
-- Errores: sin_permiso, titulo_invalido, cuerpo_invalido y vigencia_invalida.
create or replace function public.publicar_noticia(p_titulo text, p_cuerpo text, p_visible_hasta timestamptz default null)
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  publicada_por text,
  created_at timestamptz,
  updated_at timestamptz,
  visible_hasta timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_cuerpo text := btrim(coalesce(p_cuerpo, ''));
  v_id uuid;
  v_creada timestamptz;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.validar_noticia(v_titulo, v_cuerpo);
  if p_visible_hasta is not null and p_visible_hasta <= now() then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;

  insert into public.noticias (conjunto_id, titulo, cuerpo, publicada_por, visible_hasta)
  values (v_perfil.conjunto_id, v_titulo, v_cuerpo, v_perfil.id, p_visible_hasta)
  returning noticias.id, noticias.created_at into v_id, v_creada;

  -- Evento para la notificación «Nuevo comunicado» (RF09 la envía como push).
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
  select p.id, 'noticia_nueva', 'Nuevo comunicado', v_titulo, v_id
    from public.perfiles p
   where p.conjunto_id = v_perfil.conjunto_id and p.id <> v_perfil.id;

  return query select v_id, v_titulo, v_cuerpo, v_perfil.nombre, v_creada, null::timestamptz, p_visible_hasta;
end;
$$;

-- Cambia el título, el mensaje y «visible hasta» (null = no vence); guarda quién y cuándo lo
-- editó. Un comunicado vencido vuelve a Inicio si se le pone una fecha futura o se le quita.
-- Errores: sin_permiso, no_encontrada, titulo_invalido, cuerpo_invalido y vigencia_invalida.
create or replace function public.editar_noticia(p_id uuid, p_titulo text, p_cuerpo text, p_visible_hasta timestamptz default null)
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  publicada_por text,
  created_at timestamptz,
  updated_at timestamptz,
  visible_hasta timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_titulo text := btrim(coalesce(p_titulo, ''));
  v_cuerpo text := btrim(coalesce(p_cuerpo, ''));
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  perform public.validar_noticia(v_titulo, v_cuerpo);
  if p_visible_hasta is not null and p_visible_hasta <= now() then
    raise exception 'vigencia_invalida' using errcode = '22023';
  end if;

  update public.noticias n
     set titulo = v_titulo, cuerpo = v_cuerpo, visible_hasta = p_visible_hasta,
         editada_por = v_perfil.id, updated_at = now()
   where n.id = p_id and n.conjunto_id = v_perfil.conjunto_id;
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;

  -- El aviso pendiente muestra el título nuevo.
  update public.notificaciones x set mensaje = v_titulo
   where x.tipo = 'noticia_nueva' and x.referencia_id = p_id;

  return query
    select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at, n.visible_hasta
      from public.noticias n
      join public.perfiles p on p.id = n.publicada_por
     where n.id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.noticias_conjunto(integer, boolean) from public, anon, authenticated;
revoke execute on function public.detalle_noticia(uuid) from public, anon, authenticated;
revoke execute on function public.publicar_noticia(text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.editar_noticia(uuid, text, text, timestamptz) from public, anon, authenticated;

grant execute on function public.noticias_conjunto(integer, boolean) to authenticated;
grant execute on function public.detalle_noticia(uuid) to authenticated;
grant execute on function public.publicar_noticia(text, text, timestamptz) to authenticated;
grant execute on function public.editar_noticia(uuid, text, text, timestamptz) to authenticated;
