-- =============================================================================================
-- Convive · Radicación de PQRS y reportes de daño con fotos (RF07)
--
-- Modelo: «pqrs» guarda cada petición, queja, reclamo, sugerencia o reporte de daño con su
-- radicado consecutivo por conjunto y su estado (pendiente, en proceso, resuelto). «pqrs_fotos»
-- guarda hasta 3 fotos por PQRS (JPG o PNG de máx. 5 MB) que viven en el bucket privado
-- «pqrs-fotos» de Supabase Storage, en la carpeta del conjunto. «pqrs_respuestas» es el historial
-- de respuestas de la administración. Al radicar se crea un aviso en «notificaciones» para cada
-- administrador del conjunto (la pantalla de notificaciones es RF09).
--
-- Permisos: cualquier persona del conjunto radica y ve sus propias PQRS; el administrador ve las
-- de todo el conjunto. El conjunto y el usuario salen de la sesión (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create type public.tipo_pqrs as enum ('peticion', 'queja', 'reclamo', 'sugerencia', 'reporte_dano');
create type public.estado_pqrs as enum ('pendiente', 'en_proceso', 'resuelto');

create table public.pqrs (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  -- Consecutivo del conjunto: 232 se muestra «#0232».
  radicado integer not null check (radicado > 0),
  radicado_por uuid not null references public.perfiles (id),
  unidad_id uuid references public.unidades (id) on delete set null,
  tipo public.tipo_pqrs not null,
  descripcion text not null check (char_length(descripcion) between 20 and 1000),
  estado public.estado_pqrs not null default 'pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conjunto_id, radicado)
);

create table public.pqrs_fotos (
  id uuid primary key default gen_random_uuid(),
  pqrs_id uuid not null references public.pqrs (id) on delete cascade,
  -- Ruta en Storage: «{conjunto_id}/{archivo}».
  ruta text not null unique,
  tipo text not null check (tipo in ('image/jpeg', 'image/png')),
  bytes integer not null check (bytes > 0 and bytes <= 5242880),
  orden smallint not null check (orden between 1 and 3),
  unique (pqrs_id, orden)
);

create table public.pqrs_respuestas (
  id uuid primary key default gen_random_uuid(),
  pqrs_id uuid not null references public.pqrs (id) on delete cascade,
  autor_id uuid not null references public.perfiles (id),
  mensaje text not null check (char_length(mensaje) between 1 and 1000),
  -- Estado en que quedó la PQRS con esta respuesta.
  estado public.estado_pqrs not null,
  created_at timestamptz not null default now()
);

-- Avisos a una persona (RF09 los mostrará y los enviará como notificación).
create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  -- Qué originó el aviso: «pqrs_radicada»…
  tipo text not null,
  titulo text not null,
  mensaje text not null,
  -- ID del registro relacionado (p. ej. la PQRS).
  referencia_id uuid,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index pqrs_radicado_por_idx on public.pqrs (radicado_por, created_at desc);
create index pqrs_conjunto_idx on public.pqrs (conjunto_id, created_at desc);
create index pqrs_respuestas_pqrs_idx on public.pqrs_respuestas (pqrs_id, created_at);
create index notificaciones_perfil_idx on public.notificaciones (perfil_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.pqrs enable row level security;
alter table public.pqrs_fotos enable row level security;
alter table public.pqrs_respuestas enable row level security;
alter table public.notificaciones enable row level security;

create policy "Ver mis PQRS y la administración las de su conjunto"
  on public.pqrs for select to authenticated
  using (
    radicado_por in (select p.id from public.perfiles p where p.user_id = auth.uid())
    or (conjunto_id = public.mi_conjunto() and public.mi_rol() = 'administrador')
  );

-- Las fotos y respuestas se ven si se ve la PQRS (la política de pqrs se aplica en la subconsulta).
create policy "Ver las fotos de las PQRS que veo"
  on public.pqrs_fotos for select to authenticated
  using (exists (select 1 from public.pqrs q where q.id = pqrs_id));

create policy "Ver las respuestas de las PQRS que veo"
  on public.pqrs_respuestas for select to authenticated
  using (exists (select 1 from public.pqrs q where q.id = pqrs_id));

create policy "Ver mis notificaciones"
  on public.notificaciones for select to authenticated
  using (perfil_id in (select p.id from public.perfiles p where p.user_id = auth.uid()));

-- Sin políticas de insert/update/delete: las PQRS se radican con radicar_pqrs(), que valida los
-- datos y las fotos. Las respuestas las registra la administración (fuera de este requisito).

-- ---------------------------------------------------------------------------------------------
-- Fotos en Supabase Storage (bucket privado, máx. 5 MB, JPG o PNG)
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pqrs-fotos', 'pqrs-fotos', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "Subir fotos de PQRS a la carpeta de mi conjunto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pqrs-fotos'
    and (storage.foldername(name))[1] = public.mi_conjunto()::text
  );

create policy "Ver mis fotos de PQRS y la administración las de su conjunto"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'pqrs-fotos'
    and (
      owner_id = auth.uid()::text
      or ((storage.foldername(name))[1] = public.mi_conjunto()::text and public.mi_rol() = 'administrador')
    )
  );

-- Si la PQRS no se pudo radicar, la app borra las fotos que acababa de subir.
create policy "Borrar mis fotos de PQRS"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pqrs-fotos' and owner_id = auth.uid()::text);

-- ---------------------------------------------------------------------------------------------
-- RF07 · Radicar una PQRS
-- ---------------------------------------------------------------------------------------------

-- p_fotos: rutas en Storage de las fotos ya subidas, en orden. El formato y el tamaño se leen de
-- Storage (no se confía en la app) y cada foto debe haberla subido quien radica.
-- Errores (los traduce pqrs.supabase.ts): sin_permiso, tipo_invalido (MSG-RF07-02),
-- descripcion_invalida (MSG-RF07-03), formato_invalido (MSG-RF07-04), foto_grande (MSG-RF07-05),
-- demasiadas_fotos (MSG-RF07-06), foto_obligatoria (MSG-RF07-07) y foto_invalida (ruta ajena,
-- repetida o inexistente).
create or replace function public.radicar_pqrs(
  p_tipo public.tipo_pqrs,
  p_descripcion text,
  p_fotos text[] default '{}'
)
returns table (id uuid, radicado integer, estado public.estado_pqrs, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_descripcion text := btrim(coalesce(p_descripcion, ''));
  v_fotos text[] := coalesce(p_fotos, '{}');
  v_cantidad integer := coalesce(array_length(coalesce(p_fotos, '{}'), 1), 0);
  v_ruta text;
  v_tipo text;
  v_bytes bigint;
  v_radicado integer;
  v_id uuid;
  v_creado timestamptz;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if p_tipo is null then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;

  if char_length(v_descripcion) not between 20 and 1000 then
    raise exception 'descripcion_invalida' using errcode = '22023';
  end if;

  if v_cantidad > 3 then
    raise exception 'demasiadas_fotos' using errcode = '22023';
  end if;

  if p_tipo = 'reporte_dano' and v_cantidad = 0 then
    raise exception 'foto_obligatoria' using errcode = '22023';
  end if;

  if (select count(distinct r) from unnest(v_fotos) as r) <> v_cantidad then
    raise exception 'foto_invalida' using errcode = '22023';
  end if;

  foreach v_ruta in array v_fotos loop
    select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_tipo, v_bytes
      from storage.objects o
     where o.bucket_id = 'pqrs-fotos'
       and o.name = v_ruta
       and o.owner_id = auth.uid()::text
       and split_part(o.name, '/', 1) = v_perfil.conjunto_id::text;
    if not found or exists (select 1 from public.pqrs_fotos f where f.ruta = v_ruta) then
      raise exception 'foto_invalida' using errcode = '22023';
    end if;
    if v_tipo is null or v_tipo not in ('image/jpeg', 'image/png') then
      raise exception 'formato_invalido' using errcode = '22023';
    end if;
    if v_bytes is null or v_bytes <= 0 or v_bytes > 5242880 then
      raise exception 'foto_grande' using errcode = '22023';
    end if;
  end loop;

  -- Radicado consecutivo del conjunto: dos radicaciones al mismo tiempo se atienden en orden.
  perform pg_advisory_xact_lock(hashtextextended('pqrs|' || v_perfil.conjunto_id::text, 0));
  select coalesce(max(q.radicado), 0) + 1 into v_radicado
    from public.pqrs q
   where q.conjunto_id = v_perfil.conjunto_id;

  insert into public.pqrs (conjunto_id, radicado, radicado_por, unidad_id, tipo, descripcion, estado)
  values (v_perfil.conjunto_id, v_radicado, v_perfil.id, v_perfil.unidad_id, p_tipo, v_descripcion, 'pendiente')
  returning pqrs.id, pqrs.created_at into v_id, v_creado;

  insert into public.pqrs_fotos (pqrs_id, ruta, tipo, bytes, orden)
  select v_id, f.ruta, o.metadata ->> 'mimetype', (o.metadata ->> 'size')::integer, f.orden
    from unnest(v_fotos) with ordinality as f (ruta, orden)
    join storage.objects o on o.bucket_id = 'pqrs-fotos' and o.name = f.ruta;

  -- Aviso a la administración del conjunto.
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
  select a.id, 'pqrs_radicada', 'Nueva PQRS',
         v_perfil.nombre || ' radicó la solicitud #' || lpad(v_radicado::text, 4, '0') || '.', v_id
    from public.perfiles a
   where a.conjunto_id = v_perfil.conjunto_id and a.rol = 'administrador';

  return query select v_id, v_radicado, 'pendiente'::public.estado_pqrs, v_creado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF07 · Consultar mis PQRS y el detalle con el historial de respuestas
-- ---------------------------------------------------------------------------------------------

-- PQRS radicadas por la persona de la sesión, de la más reciente a la más antigua.
create or replace function public.mis_pqrs()
returns table (
  id uuid,
  radicado integer,
  tipo public.tipo_pqrs,
  descripcion text,
  estado public.estado_pqrs,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.radicado, q.tipo, q.descripcion, q.estado, q.created_at
    from public.pqrs q
    join public.perfiles p on p.id = q.radicado_por
   where p.user_id = auth.uid()
   order by q.created_at desc, q.radicado desc;
$$;

-- Detalle de una PQRS propia (o de su conjunto, para el administrador) con sus fotos y el
-- historial de respuestas. Es security definer para traer el nombre de quien respondió (la
-- persona no ve otros perfiles). Error: no_encontrada.
create or replace function public.detalle_pqrs(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  select jsonb_build_object(
           'id', q.id,
           'radicado', q.radicado,
           'tipo', q.tipo,
           'descripcion', q.descripcion,
           'estado', q.estado,
           'created_at', q.created_at,
           'fotos', coalesce((
             select jsonb_agg(jsonb_build_object('ruta', f.ruta, 'tipo', f.tipo, 'bytes', f.bytes) order by f.orden)
               from public.pqrs_fotos f
              where f.pqrs_id = q.id
           ), '[]'::jsonb),
           'respuestas', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', r.id, 'autor', a.nombre, 'mensaje', r.mensaje, 'estado', r.estado, 'created_at', r.created_at
                    ) order by r.created_at)
               from public.pqrs_respuestas r
               join public.perfiles a on a.id = r.autor_id
              where r.pqrs_id = q.id
           ), '[]'::jsonb)
         )
    into v_resultado
    from public.pqrs q
    join public.perfiles p on p.id = q.radicado_por
   where q.id = p_id
     and (
       p.user_id = auth.uid()
       or (q.conjunto_id = public.mi_conjunto() and public.mi_rol() = 'administrador')
     );

  if v_resultado is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.radicar_pqrs(public.tipo_pqrs, text, text[]) from public, anon, authenticated;
revoke execute on function public.mis_pqrs() from public, anon, authenticated;
revoke execute on function public.detalle_pqrs(uuid) from public, anon, authenticated;

grant execute on function public.radicar_pqrs(public.tipo_pqrs, text, text[]) to authenticated;
grant execute on function public.mis_pqrs() to authenticated;
grant execute on function public.detalle_pqrs(uuid) to authenticated;
