-- =============================================================================================
-- Convive · Reserva de zonas comunes (RF05) con validación de disponibilidad en el servidor (RF06)
--
-- Modelo: «zonas_comunes» es el catálogo de zonas de cada conjunto con su horario permitido, su
-- aforo y si la reserva requiere aprobación de la administración. «reservas» guarda cada reserva
-- de una unidad: una fecha y una franja de horas enteras (bloques de 1 hora).
--
-- Reglas: fecha desde hoy hasta el último día del tercer mes siguiente (hora de Colombia); hora
-- inicio < hora fin; dentro del horario de la zona; asistentes entre 1 y el aforo; y que la franja
-- no se cruce con otra reserva confirmada o pendiente de la misma zona. Las zonas que requieren
-- aprobación quedan «pendiente»; las demás, «confirmada».
--
-- Permisos: cualquier persona con una unidad del conjunto reserva. Cada quien ve las reservas de
-- su unidad y el administrador las de todo el conjunto. La disponibilidad (solo fechas y horas,
-- sin datos de quién reservó) la consulta cualquier persona del conjunto.
-- El conjunto, la unidad y el usuario salen de la sesión (auth.uid()), nunca de la app.
--
-- Requiere: 20261003000000_autenticacion.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

create type public.estado_reserva as enum ('pendiente', 'confirmada', 'rechazada', 'cancelada');

create table public.zonas_comunes (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  nombre text not null,
  -- Horario permitido en horas enteras: 08:00 a 22:00.
  hora_apertura time not null,
  hora_cierre time not null,
  aforo integer not null check (aforo > 0),
  requiere_aprobacion boolean not null default false,
  -- Las inactivas no se ofrecen para reservar.
  activa boolean not null default true,
  -- Orden de los chips en la pantalla.
  orden smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (conjunto_id, nombre),
  check (hora_apertura < hora_cierre),
  check (extract(minute from hora_apertura) = 0 and extract(second from hora_apertura) = 0),
  check (extract(minute from hora_cierre) = 0 and extract(second from hora_cierre) = 0)
);

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  conjunto_id uuid not null references public.conjuntos (id) on delete cascade,
  zona_id uuid not null references public.zonas_comunes (id) on delete cascade,
  unidad_id uuid not null references public.unidades (id) on delete cascade,
  -- Auditoría: quién y cuándo reservó.
  reservado_por uuid not null references public.perfiles (id),
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  -- Opcional: entre 1 y el aforo de la zona (lo valida crear_reserva()).
  asistentes integer check (asistentes > 0),
  estado public.estado_reserva not null,
  created_at timestamptz not null default now(),
  check (hora_inicio < hora_fin)
);

create index zonas_comunes_conjunto_idx on public.zonas_comunes (conjunto_id);
create index reservas_zona_fecha_idx on public.reservas (zona_id, fecha);
create index reservas_unidad_idx on public.reservas (unidad_id);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------------------------

alter table public.zonas_comunes enable row level security;
alter table public.reservas enable row level security;

create policy "Ver las zonas comunes de mi conjunto"
  on public.zonas_comunes for select to authenticated
  using (conjunto_id = public.mi_conjunto());

create policy "Ver las reservas de mi unidad"
  on public.reservas for select to authenticated
  using (unidad_id in (select p.unidad_id from public.perfiles p where p.user_id = auth.uid()));

create policy "La administración ve las reservas de su conjunto"
  on public.reservas for select to authenticated
  using (conjunto_id = public.mi_conjunto() and public.mi_rol() = 'administrador');

-- Sin políticas de insert/update/delete: las reservas se crean con crear_reserva(), que valida los
-- datos y la disponibilidad. Las zonas las configura la administración desde el panel de Supabase.

-- ---------------------------------------------------------------------------------------------
-- RF05 · Disponibilidad de una zona
-- ---------------------------------------------------------------------------------------------

-- Franjas ocupadas (reservas confirmadas o pendientes) de la zona entre dos fechas. La app calcula
-- con ellas las horas libres y los días sin cupo. Es security definer porque la persona no ve las
-- reservas de otras unidades: solo devuelve fechas y horas.
-- Errores: sin_permiso, zona_invalida (zona de otro conjunto o inactiva) y rango_invalido.
create or replace function public.disponibilidad_zona(p_zona_id uuid, p_desde date, p_hasta date)
returns table (fecha date, hora_inicio time, hora_fin time)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_conjunto() is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.zonas_comunes z
     where z.id = p_zona_id and z.conjunto_id = public.mi_conjunto() and z.activa
  ) then
    raise exception 'zona_invalida' using errcode = '22023';
  end if;

  -- La ventana de reservas es de 4 meses como máximo (el actual y 3 más).
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta > p_desde + 124 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  return query
    select r.fecha, r.hora_inicio, r.hora_fin
      from public.reservas r
     where r.zona_id = p_zona_id
       and r.estado in ('pendiente', 'confirmada')
       and r.fecha between p_desde and p_hasta
     order by r.fecha, r.hora_inicio;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- RF05 / RF06 · Crear una reserva
-- ---------------------------------------------------------------------------------------------

-- Errores (los traduce reservations.supabase.ts): sin_permiso (sin unidad), zona_invalida
-- (MSG-RF05-04), fecha_invalida, horario_invalido (MSG-RF05-05), fuera_de_horario (MSG-RF05-06),
-- hora_pasada, asistentes_invalidos, aforo_excedido (MSG-RF05-07) y sin_disponibilidad (la franja
-- se cruza con otra reserva).
create or replace function public.crear_reserva(
  p_zona_id uuid,
  p_fecha date,
  p_hora_inicio time,
  p_hora_fin time,
  p_asistentes integer default null
)
returns table (id uuid, estado public.estado_reserva, zona text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil public.perfiles;
  v_zona public.zonas_comunes;
  -- «Ahora» en la hora de Colombia.
  v_ahora timestamp := now() at time zone 'America/Bogota';
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_estado public.estado_reserva;
  v_id uuid;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.unidad_id is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_zona
    from public.zonas_comunes z
   where z.id = p_zona_id and z.conjunto_id = v_perfil.conjunto_id and z.activa;
  if v_zona.id is null then
    raise exception 'zona_invalida' using errcode = '22023';
  end if;

  -- Desde hoy hasta el último día del tercer mes siguiente.
  if p_fecha is null or p_fecha < v_hoy
     or p_fecha >= (date_trunc('month', v_hoy) + interval '4 months')::date then
    raise exception 'fecha_invalida' using errcode = '22023';
  end if;

  -- Bloques de 1 hora: horas enteras y la final posterior a la inicial.
  if p_hora_inicio is null or p_hora_fin is null or p_hora_fin <= p_hora_inicio
     or extract(minute from p_hora_inicio) <> 0 or extract(second from p_hora_inicio) <> 0
     or extract(minute from p_hora_fin) <> 0 or extract(second from p_hora_fin) <> 0 then
    raise exception 'horario_invalido' using errcode = '22023';
  end if;

  -- El detalle lleva el horario para armar MSG-RF05-06: «08:00|22:00».
  if p_hora_inicio < v_zona.hora_apertura or p_hora_fin > v_zona.hora_cierre then
    raise exception 'fuera_de_horario' using errcode = '22023',
      detail = left(v_zona.hora_apertura::text, 5) || '|' || left(v_zona.hora_cierre::text, 5);
  end if;

  if p_fecha = v_hoy and p_hora_inicio <= v_ahora::time then
    raise exception 'hora_pasada' using errcode = '22023';
  end if;

  if p_asistentes is not null and p_asistentes < 1 then
    raise exception 'asistentes_invalidos' using errcode = '22023';
  end if;
  -- El detalle lleva la zona y el aforo para armar MSG-RF05-07: «Cancha|12».
  if p_asistentes > v_zona.aforo then
    raise exception 'aforo_excedido' using errcode = '22023', detail = v_zona.nombre || '|' || v_zona.aforo;
  end if;

  -- RF06: dos personas que reservan la misma zona y día al mismo tiempo se atienden en orden, así
  -- la segunda ya ve la reserva de la primera.
  perform pg_advisory_xact_lock(hashtextextended(p_zona_id::text || '|' || p_fecha::text, 0));

  if exists (
    select 1 from public.reservas r
     where r.zona_id = p_zona_id
       and r.fecha = p_fecha
       and r.estado in ('pendiente', 'confirmada')
       and r.hora_inicio < p_hora_fin
       and p_hora_inicio < r.hora_fin
  ) then
    raise exception 'sin_disponibilidad' using errcode = '23P01';
  end if;

  v_estado := case when v_zona.requiere_aprobacion then 'pendiente' else 'confirmada' end;

  insert into public.reservas (
    conjunto_id, zona_id, unidad_id, reservado_por, fecha, hora_inicio, hora_fin, asistentes, estado
  )
  values (
    v_perfil.conjunto_id, v_zona.id, v_perfil.unidad_id, v_perfil.id, p_fecha, p_hora_inicio, p_hora_fin,
    p_asistentes, v_estado
  )
  returning reservas.id into v_id;

  return query select v_id, v_estado, v_zona.nombre;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.disponibilidad_zona(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.crear_reserva(uuid, date, time, time, integer) from public, anon, authenticated;

grant execute on function public.disponibilidad_zona(uuid, date, date) to authenticated;
grant execute on function public.crear_reserva(uuid, date, time, time, integer) to authenticated;
