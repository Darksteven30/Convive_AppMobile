-- =============================================================================================
-- Convive · Cambio de estado de PQRS / daño (RF08)
--
-- El administrador atiende las PQRS de su conjunto: las consulta todas, cambia su estado siguiendo
-- el flujo Pendiente → En proceso → Resuelto («Resuelto» es final) y deja un comentario para el
-- propietario, obligatorio al resolver (10 a 500 caracteres). Cada cambio queda en el historial
-- (pqrs_respuestas) con quién y cuándo lo hizo, y crea un aviso en «notificaciones» para quien
-- radicó la PQRS; el envío push de ese aviso es RF09.
--
-- Permisos: solo el administrador del conjunto. El conjunto y el usuario salen de la sesión
-- (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql y 20261022000000_pqrs.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- RF08 · PQRS del conjunto (vista del administrador)
-- ---------------------------------------------------------------------------------------------

-- Todas las PQRS del conjunto con quién las radicó y su unidad, de la más reciente a la más
-- antigua. Es security definer para leer el nombre de quien radicó. Error: sin_permiso.
create or replace function public.pqrs_conjunto()
returns table (
  id uuid,
  radicado integer,
  tipo public.tipo_pqrs,
  descripcion text,
  estado public.estado_pqrs,
  created_at timestamptz,
  radicado_por text,
  unidad text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  return query
    select q.id, q.radicado, q.tipo, q.descripcion, q.estado, q.created_at, p.nombre, u.nombre
      from public.pqrs q
      join public.perfiles p on p.id = q.radicado_por
      left join public.unidades u on u.id = q.unidad_id
     where q.conjunto_id = public.mi_conjunto()
     order by q.created_at desc, q.radicado desc;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF07 / RF08 · Detalle de una PQRS
-- ---------------------------------------------------------------------------------------------

-- Igual que en RF07, y para el administrador también trae quién la radicó y su unidad.
create or replace function public.detalle_pqrs(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
  v_es_admin boolean := public.mi_rol() is not distinct from 'administrador';
begin
  select jsonb_build_object(
           'id', q.id,
           'radicado', q.radicado,
           'tipo', q.tipo,
           'descripcion', q.descripcion,
           'estado', q.estado,
           'created_at', q.created_at,
           'radicado_por', case when v_es_admin then p.nombre end,
           'unidad', case when v_es_admin then u.nombre end,
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
    left join public.unidades u on u.id = q.unidad_id
   where q.id = p_id
     and (
       p.user_id = auth.uid()
       or (q.conjunto_id = public.mi_conjunto() and v_es_admin)
     );

  if v_resultado is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;
  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF08 · Cambiar el estado
-- ---------------------------------------------------------------------------------------------

-- Errores (los traduce pqrs.supabase.ts): sin_permiso (MSG-RF08-04), no_encontrada,
-- transicion_invalida (MSG-RF08-03; el detalle lleva «actual|nuevo»), comentario_obligatorio
-- (MSG-RF08-02) y comentario_invalido (fuera de 10 a 500 caracteres).
create or replace function public.cambiar_estado_pqrs(
  p_id uuid,
  p_estado public.estado_pqrs,
  p_comentario text default null
)
returns table (id uuid, autor text, mensaje text, estado public.estado_pqrs, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_pqrs public.pqrs;
  v_comentario text := nullif(btrim(coalesce(p_comentario, '')), '');
  v_etiqueta text;
  v_mensaje text;
  v_id uuid;
  v_creado timestamptz;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.rol <> 'administrador' then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  -- Se bloquea la PQRS: si dos administradores la cambian al tiempo, el segundo ve el estado nuevo.
  select * into v_pqrs
    from public.pqrs q
   where q.id = p_id and q.conjunto_id = v_perfil.conjunto_id
     for update;
  if v_pqrs.id is null then
    raise exception 'no_encontrada' using errcode = 'P0002';
  end if;

  -- Flujo: Pendiente → En proceso → Resuelto (final).
  if p_estado is null or not (
       (v_pqrs.estado = 'pendiente' and p_estado = 'en_proceso')
       or (v_pqrs.estado = 'en_proceso' and p_estado = 'resuelto')
     ) then
    raise exception 'transicion_invalida' using errcode = '22023',
      detail = v_pqrs.estado::text || '|' || coalesce(p_estado::text, '');
  end if;

  if p_estado = 'resuelto' and v_comentario is null then
    raise exception 'comentario_obligatorio' using errcode = '22023';
  end if;
  if v_comentario is not null and char_length(v_comentario) not between 10 and 500 then
    raise exception 'comentario_invalido' using errcode = '22023';
  end if;

  v_etiqueta := case p_estado when 'en_proceso' then 'En proceso' when 'resuelto' then 'Resuelto' else 'Pendiente' end;
  v_mensaje := coalesce(v_comentario, 'Cambió el estado a ' || v_etiqueta || '.');

  update public.pqrs q set estado = p_estado, updated_at = now() where q.id = v_pqrs.id;

  -- Historial que ve el propietario, con quién y cuándo (la hora real del cambio, así dos cambios
  -- seguidos quedan en orden aunque ocurran en la misma transacción).
  insert into public.pqrs_respuestas (pqrs_id, autor_id, mensaje, estado, created_at)
  values (v_pqrs.id, v_perfil.id, v_mensaje, p_estado, clock_timestamp())
  returning pqrs_respuestas.id, pqrs_respuestas.created_at into v_id, v_creado;

  -- Evento para la notificación al propietario (RF09 la envía como push).
  insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
  values (
    v_pqrs.radicado_por, 'pqrs_estado', 'Tu PQRS cambió de estado',
    'Tu solicitud #' || lpad(v_pqrs.radicado::text, 4, '0') || ' ahora está «' || v_etiqueta || '».',
    v_pqrs.id
  );

  return query select v_id, v_perfil.nombre, v_mensaje, p_estado, v_creado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.pqrs_conjunto() from public, anon, authenticated;
revoke execute on function public.cambiar_estado_pqrs(uuid, public.estado_pqrs, text) from public, anon, authenticated;

grant execute on function public.pqrs_conjunto() to authenticated;
grant execute on function public.cambiar_estado_pqrs(uuid, public.estado_pqrs, text) to authenticated;

-- detalle_pqrs() conserva los permisos de RF07 (create or replace no los cambia).
