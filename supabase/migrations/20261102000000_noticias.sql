-- =============================================================================================
-- Convive · Noticias y comunicados (RF19, propuesto)
--
-- Modelo: «noticias» guarda los comunicados oficiales del conjunto: título, mensaje, quién lo
-- publicó y cuándo, y quién lo editó por última vez. Por ahora cada comunicado es para todo el
-- conjunto: las unidades aún no tienen torre/bloque como dato aparte, así que la segmentación por
-- torre/bloque queda para cuando exista.
--
-- Reglas: título de 5 a 60 caracteres y mensaje de 10 a 2.000 (sin contar espacios al inicio y al
-- final). Al publicar se crea un aviso «Nuevo comunicado» en «notificaciones» para las demás
-- personas del conjunto (RF09 lo envía como push).
--
-- Permisos: todas las personas del conjunto leen sus comunicados; solo el administrador los
-- publica, edita y elimina. El conjunto y el usuario salen de la sesión (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql y 20261022000000_pqrs.sql (tabla notificaciones).
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create table public.noticias (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  titulo text not null check (titulo = btrim(titulo) and char_length(titulo) between 5 and 60),
  cuerpo text not null check (cuerpo = btrim(cuerpo) and char_length(cuerpo) between 10 and 2000),
  -- Auditoría: quién publicó y quién editó por última vez.
  publicada_por uuid not null references public.perfiles (id),
  created_at timestamptz not null default now(),
  editada_por uuid references public.perfiles (id),
  updated_at timestamptz,
  check ((editada_por is null) = (updated_at is null))
);

create index noticias_conjunto_idx on public.noticias (conjunto_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.noticias enable row level security;

create policy "Ver los comunicados de mi conjunto"
  on public.noticias for select to authenticated
  using (conjunto_id = public.mi_conjunto());

-- Sin políticas de insert/update/delete: los comunicados se manejan con publicar_noticia(),
-- editar_noticia() y eliminar_noticia(), que validan el rol y los datos.

-- ---------------------------------------------------------------------------------------------
-- RF19 · Consultar
-- ---------------------------------------------------------------------------------------------

-- Comunicados del conjunto, del más reciente al más antiguo, con quién los publicó. p_limite
-- (opcional) es para «Últimas noticias» de Inicio. Es security definer para leer el nombre de quien
-- publicó.
create or replace function public.noticias_conjunto(p_limite integer default null)
returns table (id uuid, titulo text, cuerpo text, publicada_por text, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at
    from public.noticias n
    join public.perfiles p on p.id = n.publicada_por
   where n.conjunto_id = public.mi_conjunto()
   order by n.created_at desc
   limit p_limite;
$$;

-- Un comunicado del conjunto. Error: no_encontrada (no existe o es de otro conjunto).
create or replace function public.detalle_noticia(p_id uuid)
returns table (id uuid, titulo text, cuerpo text, publicada_por text, created_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
    select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at
      from public.noticias n
      join public.perfiles p on p.id = n.publicada_por
     where n.id = p_id and n.conjunto_id = public.mi_conjunto();
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF19 · Publicar, editar y eliminar (administrador)
-- ---------------------------------------------------------------------------------------------

-- Valida el título y el mensaje ya sin espacios al inicio ni al final.
-- Errores: titulo_invalido y cuerpo_invalido.
create or replace function public.validar_noticia(p_titulo text, p_cuerpo text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if char_length(coalesce(p_titulo, '')) not between 5 and 60 then
    raise exception 'titulo_invalido' using errcode = '22023';
  end if;
  if char_length(coalesce(p_cuerpo, '')) not between 10 and 2000 then
    raise exception 'cuerpo_invalido' using errcode = '22023';
  end if;
end;
$$;

-- Publica el comunicado con la hora del servidor y avisa a las demás personas del conjunto.
-- Errores (los traduce news.supabase.ts): sin_permiso, titulo_invalido y cuerpo_invalido.
create or replace function public.publicar_noticia(p_titulo text, p_cuerpo text)
returns table (id uuid, titulo text, cuerpo text, publicada_por text, created_at timestamptz, updated_at timestamptz)
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

  insert into public.noticias (conjunto_id, titulo, cuerpo, publicada_por)
  values (v_perfil.conjunto_id, v_titulo, v_cuerpo, v_perfil.id)
  returning noticias.id, noticias.created_at into v_id, v_creada;

  -- Evento para la notificación «Nuevo comunicado» (RF09 la envía como push).
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
  select p.id, 'noticia_nueva', 'Nuevo comunicado', v_titulo, v_id
    from public.perfiles p
   where p.conjunto_id = v_perfil.conjunto_id and p.id <> v_perfil.id;

  return query select v_id, v_titulo, v_cuerpo, v_perfil.nombre, v_creada, null::timestamptz;
end;
$$;

-- Cambia el título y el mensaje; guarda quién y cuándo lo editó. No vuelve a avisar.
-- Errores: sin_permiso, no_encontrada, titulo_invalido y cuerpo_invalido.
create or replace function public.editar_noticia(p_id uuid, p_titulo text, p_cuerpo text)
returns table (id uuid, titulo text, cuerpo text, publicada_por text, created_at timestamptz, updated_at timestamptz)
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

  update public.noticias n
     set titulo = v_titulo, cuerpo = v_cuerpo, editada_por = v_perfil.id, updated_at = now()
   where n.id = p_id and n.conjunto_id = v_perfil.conjunto_id;
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;

  -- El aviso pendiente muestra el título nuevo.
  update public.notificaciones x set mensaje = v_titulo
   where x.tipo = 'noticia_nueva' and x.referencia_id = p_id;

  return query
    select n.id, n.titulo, n.cuerpo, p.nombre, n.created_at, n.updated_at
      from public.noticias n
      join public.perfiles p on p.id = n.publicada_por
     where n.id = p_id;
end;
$$;

-- Elimina el comunicado y sus avisos. Errores: sin_permiso y no_encontrada.
create or replace function public.eliminar_noticia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  delete from public.noticias n where n.id = p_id and n.conjunto_id = v_perfil.conjunto_id;
  if not found then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;

  delete from public.notificaciones x where x.tipo = 'noticia_nueva' and x.referencia_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.noticias_conjunto(integer) from public, anon, authenticated;
revoke execute on function public.detalle_noticia(uuid) from public, anon, authenticated;
revoke execute on function public.validar_noticia(text, text) from public, anon, authenticated;
revoke execute on function public.publicar_noticia(text, text) from public, anon, authenticated;
revoke execute on function public.editar_noticia(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.eliminar_noticia(uuid) from public, anon, authenticated;

grant execute on function public.noticias_conjunto(integer) to authenticated;
grant execute on function public.detalle_noticia(uuid) to authenticated;
grant execute on function public.publicar_noticia(text, text) to authenticated;
grant execute on function public.editar_noticia(uuid, text, text) to authenticated;
grant execute on function public.eliminar_noticia(uuid) to authenticated;
