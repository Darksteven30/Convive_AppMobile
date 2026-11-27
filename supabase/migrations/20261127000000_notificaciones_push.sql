-- =============================================================================================
-- Convive · RF09: notificaciones push
--
-- La tabla «notificaciones» (20261022000000_pqrs.sql) ya guarda los avisos de cada persona:
-- PQRS radicada (al administrador), cambio de estado de una PQRS y nuevo comunicado. Esta
-- migración:
--   · guarda los celulares de cada persona (dispositivos_push), que la app registra al iniciar
--     sesión con su Expo push token;
--   · envía cada notificación nueva como push al servicio de Expo (https://exp.host) desde la base
--     de datos con pg_net (ya activo por la conciliación de Wompi), una sola vez por notificación;
--   · agrega los eventos «pago aprobado / rechazado» y «reserva confirmada»;
--   · define a qué pantalla lleva cada notificación al tocarla (data.url).
--
-- Si el envío falla (sin pg_net, sin internet) el evento que la originó no falla: la notificación
-- queda guardada sin push_enviada_at.
--
-- Requiere: autenticación, pagos (Wompi), reservas, PQRS y noticias; extensión pg_net.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- ---------------------------------------------------------------------------------------------
-- Celulares de cada persona
-- ---------------------------------------------------------------------------------------------

create table public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles (id) on delete cascade,
  -- Expo push token: «ExponentPushToken[…]». Un celular pertenece a una sola persona a la vez.
  token text not null unique check (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  plataforma text not null check (plataforma in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index dispositivos_push_perfil_idx on public.dispositivos_push (perfil_id);

-- Sin políticas: solo se usa desde las funciones de abajo.
alter table public.dispositivos_push enable row level security;

-- Registra el celular de quien tiene la sesión. Si el celular era de otra persona (cerró sesión y
-- entró otra), pasa a la nueva: así nadie recibe los avisos de otra cuenta.
create or replace function public.registrar_dispositivo_push(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perfil uuid := (select id from public.perfiles where user_id = auth.uid());
begin
  if v_perfil is null then
    raise exception 'sin_perfil';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' or p_plataforma not in ('android', 'ios') then
    raise exception 'token_invalido';
  end if;

  insert into public.dispositivos_push (perfil_id, token, plataforma)
  values (v_perfil, p_token, p_plataforma)
  on conflict (token) do update
    set perfil_id = excluded.perfil_id, plataforma = excluded.plataforma, updated_at = now();
end;
$$;

-- Al cerrar sesión el celular deja de recibir los avisos de esa cuenta.
create or replace function public.eliminar_dispositivo_push(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.dispositivos_push
   where token = p_token
     and perfil_id = (select id from public.perfiles where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------------------------
-- Envío de cada notificación nueva
-- ---------------------------------------------------------------------------------------------

alter table public.notificaciones add column push_enviada_at timestamptz;

-- Pantalla que abre la app al tocar la notificación (Expo Router).
create or replace function public.url_notificacion(p_tipo text, p_referencia uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case p_tipo
    when 'pqrs_estado' then '/pqrs/' || p_referencia
    when 'pqrs_radicada' then '/gestion-pqrs/' || p_referencia
    when 'noticia_nueva' then '/noticias/' || p_referencia
    when 'reserva_confirmada' then '/reservas'
    when 'pago_aprobado' then coalesce(
      '/pago/confirmacion?reference=' || (select referencia from public.transacciones_pago where id = p_referencia),
      '/pagos')
    when 'pago_rechazado' then coalesce(
      '/pago/confirmacion?reference=' || (select referencia from public.transacciones_pago where id = p_referencia),
      '/pagos')
    when 'pago_por_vencer' then '/pago/seleccion'
    else '/inicio'
  end;
$$;

-- Envía la notificación a los celulares de la persona por el servicio push de Expo. Se llama una
-- sola vez por notificación (al insertarla), así un mismo evento no llega dos veces.
create or replace function public.enviar_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tokens jsonb;
begin
  select jsonb_agg(d.token) into v_tokens
    from public.dispositivos_push d
   where d.perfil_id = new.perfil_id;
  if v_tokens is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := jsonb_build_object(
        'to', v_tokens,
        'title', new.titulo,
        'body', new.mensaje,
        'sound', 'default',
        'channelId', 'default',
        'data', jsonb_build_object(
          'url', public.url_notificacion(new.tipo, new.referencia_id),
          'notificacionId', new.id,
          'tipo', new.tipo
        )
      )
    );
    update public.notificaciones set push_enviada_at = now() where id = new.id;
  exception when others then
    -- El push nunca debe impedir el evento que lo originó (un pago, una PQRS…).
    raise warning 'No se pudo enviar el push de la notificación %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger enviar_push_al_crear
  after insert on public.notificaciones
  for each row execute function public.enviar_push();

-- ---------------------------------------------------------------------------------------------
-- Eventos nuevos: pago aprobado / rechazado y reserva confirmada
-- ---------------------------------------------------------------------------------------------

-- «$ 1.250.000,00», como en la app.
create or replace function public.formato_pesos(p_valor numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select '$ ' || translate(to_char(p_valor, 'FM999,999,999,990.00'), ',.', '.,');
$$;

-- Un mismo evento (persona + tipo + registro) se avisa una sola vez.
create or replace function public.notificar_una_vez(
  p_perfil uuid, p_tipo text, p_titulo text, p_mensaje text, p_referencia uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.notificaciones
     where perfil_id = p_perfil and tipo = p_tipo and referencia_id = p_referencia
  ) then
    insert into public.notificaciones (perfil_id, tipo, titulo, mensaje, referencia_id)
    values (p_perfil, p_tipo, p_titulo, p_mensaje, p_referencia);
  end if;
end;
$$;

create or replace function public.avisar_pago()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_concepto text := coalesce(new.descripcion, (select nombre from public.conceptos_pago where id = new.concepto_id));
begin
  if new.estado = 'APROBADA' then
    perform public.notificar_una_vez(
      new.creada_por, 'pago_aprobado', 'Pago aprobado',
      'Recibimos tu pago de ' || public.formato_pesos(new.monto) || ' por ' || v_concepto || '.', new.id);
  elsif new.estado = 'RECHAZADA' then
    perform public.notificar_una_vez(
      new.creada_por, 'pago_rechazado', 'Pago rechazado',
      'Tu pago de ' || public.formato_pesos(new.monto) || ' no fue aprobado. No se realizó ningún cobro.', new.id);
  end if;
  return new;
end;
$$;

create trigger avisar_pago_al_cambiar_estado
  after update of estado on public.transacciones_pago
  for each row
  when (old.estado is distinct from new.estado and new.estado in ('APROBADA', 'RECHAZADA'))
  execute function public.avisar_pago();

create or replace function public.avisar_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notificar_una_vez(
    new.reservado_por, 'reserva_confirmada', 'Reserva confirmada',
    (select nombre from public.zonas_comunes where id = new.zona_id)
      || ' el ' || to_char(new.fecha, 'DD/MM')
      || ' de ' || to_char(new.hora_inicio, 'HH24:MI') || ' a ' || to_char(new.hora_fin, 'HH24:MI') || '.',
    new.id);
  return new;
end;
$$;

-- Al crearla ya confirmada (zonas sin aprobación) o cuando la administración la apruebe.
create trigger avisar_reserva_al_crear
  after insert on public.reservas
  for each row
  when (new.estado = 'confirmada')
  execute function public.avisar_reserva();

create trigger avisar_reserva_al_confirmar
  after update of estado on public.reservas
  for each row
  when (old.estado is distinct from new.estado and new.estado = 'confirmada')
  execute function public.avisar_reserva();

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.registrar_dispositivo_push(text, text) from public, anon, authenticated;
revoke execute on function public.eliminar_dispositivo_push(text) from public, anon, authenticated;
revoke execute on function public.url_notificacion(text, uuid) from public, anon, authenticated;
revoke execute on function public.enviar_push() from public, anon, authenticated;
revoke execute on function public.notificar_una_vez(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.avisar_pago() from public, anon, authenticated;
revoke execute on function public.avisar_reserva() from public, anon, authenticated;

grant execute on function public.registrar_dispositivo_push(text, text) to authenticated;
grant execute on function public.eliminar_dispositivo_push(text) to authenticated;
