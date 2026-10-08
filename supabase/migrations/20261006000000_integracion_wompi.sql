-- =============================================================================================
-- Convive · Integración y conciliación con Wompi (RF15)
--
-- Llaves: cada conjunto tiene su cuenta Wompi. La llave pública vive en «wompi_conjuntos» (es la
-- única que llega a la app); la privada, el secreto de eventos y el de integridad se guardan
-- CIFRADOS en el Vault de Supabase («wompi_<tipo>_<id del conjunto>»). Se cargan con
-- configurar_wompi(), que exige que las cuatro llaves sean del mismo ambiente: así no se pueden
-- mezclar llaves de Sandbox y de Producción, y pasar a producción es una sola llamada.
--
-- Estado de los pagos: lo confirman las Edge Functions (supabase/functions) con aplicar_estado_wompi():
--   · wompi-webhook   → evento transaction.updated (checksum validado, idempotente).
--   · wompi-estado    → la app consulta el estado de su pago en el API de Wompi.
--   · wompi-conciliar → cada 15 min revisa los pagos PENDIENTES de más de 30 min (pg_cron).
-- El saldo se descuenta una sola vez cuando el pago queda APROBADO y se devuelve si se ANULA.
--
-- Requiere: 20261005000000_pago_wompi.sql. Antes de la tarea programada: guardar en el Vault
-- «project_url» y «conciliacion_token» (ver README → «Wompi»).
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------------------------

-- La llave pública debe ser del mismo ambiente que el conjunto.
alter table public.wompi_conjuntos
  add constraint wompi_llave_del_ambiente check (
    llave_publica is null
    or (ambiente = 'sandbox' and llave_publica like 'pub_test_%')
    or (ambiente = 'produccion' and llave_publica like 'pub_prod_%')
  );

-- Valor que se descontó del saldo al aprobarse (null: aún no se aplica). Evita aplicarlo dos veces
-- y permite devolverlo exacto si Wompi anula el pago.
alter table public.transacciones_pago add column monto_aplicado numeric(18, 2);

-- Eventos recibidos de Wompi. El checksum es único: si el mismo evento llega dos veces, se procesa una vez.
create table public.eventos_wompi (
  id uuid primary key default gen_random_uuid(),
  checksum text not null unique,
  evento text not null,
  referencia text,
  wompi_id text,
  estado text,
  payload jsonb not null,
  resultado text,
  recibido_at timestamptz not null default now()
);

alter table public.eventos_wompi enable row level security; -- sin políticas: solo el servidor

-- ---------------------------------------------------------------------------------------------
-- Llaves de Wompi por conjunto (Vault)
-- ---------------------------------------------------------------------------------------------

-- Lee un secreto del conjunto: tipo = 'privada' | 'eventos' | 'integridad'.
create or replace function public.secreto_wompi(p_conjunto_id uuid, p_tipo text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'wompi_' || p_tipo || '_' || p_conjunto_id::text;
$$;

-- El RF12 lee el secreto de integridad con esta función; ahora usa la misma convención.
create or replace function public.secreto_integridad_wompi(p_conjunto_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.secreto_wompi(p_conjunto_id, 'integridad');
$$;

create or replace function public.guardar_secreto_vault(p_nombre text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nombre;
  if v_id is null then
    perform vault.create_secret(p_valor, p_nombre);
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
end;
$$;

-- Carga o cambia las llaves de un conjunto. Solo desde el SQL Editor (no la puede llamar la app).
-- Ejemplo (Sandbox):
--   select public.configurar_wompi(
--     (select id from conjuntos where nombre = 'Conjunto Residencial Convive'), 'sandbox',
--     'pub_test_…', 'prv_test_…', 'test_events_…', 'test_integrity_…');
create or replace function public.configurar_wompi(
  p_conjunto_id uuid,
  p_ambiente text,
  p_llave_publica text,
  p_llave_privada text,
  p_secreto_eventos text,
  p_secreto_integridad text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sufijo text;
  v_eventos text;
begin
  if p_ambiente not in ('sandbox', 'produccion') then
    raise exception 'ambiente_invalido: use sandbox o produccion';
  end if;
  v_sufijo := case p_ambiente when 'sandbox' then 'test' else 'prod' end;
  v_eventos := v_sufijo || '_events_';

  -- Las cuatro llaves deben ser del mismo ambiente (evita mezclar Sandbox con Producción).
  if p_llave_publica not like 'pub_' || v_sufijo || '_%'
     or p_llave_privada not like 'prv_' || v_sufijo || '_%'
     or p_secreto_eventos not like v_eventos || '%'
     or p_secreto_integridad not like v_sufijo || '_integrity_%' then
    raise exception 'llaves_de_otro_ambiente: todas deben ser de %', p_ambiente;
  end if;
  if not exists (select 1 from public.conjuntos where id = p_conjunto_id) then
    raise exception 'conjunto_no_existe';
  end if;

  insert into public.wompi_conjuntos (conjunto_id, ambiente, llave_publica, activo, updated_at)
  values (p_conjunto_id, p_ambiente, p_llave_publica, true, now())
  on conflict (conjunto_id) do update
    set ambiente = excluded.ambiente, llave_publica = excluded.llave_publica, activo = true, updated_at = now();

  perform public.guardar_secreto_vault('wompi_privada_' || p_conjunto_id, p_llave_privada);
  perform public.guardar_secreto_vault('wompi_eventos_' || p_conjunto_id, p_secreto_eventos);
  perform public.guardar_secreto_vault('wompi_integridad_' || p_conjunto_id, p_secreto_integridad);
end;
$$;

-- Credenciales que necesita el servidor para hablar con Wompi sobre un pago (Edge Functions).
create or replace function public.credenciales_wompi(p_referencia text)
returns table (conjunto_id uuid, ambiente text, llave_privada text, secreto_eventos text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.conjunto_id, w.ambiente,
         public.secreto_wompi(u.conjunto_id, 'privada'),
         public.secreto_wompi(u.conjunto_id, 'eventos')
    from public.transacciones_pago t
    join public.unidades u on u.id = t.unidad_id
    join public.wompi_conjuntos w on w.conjunto_id = u.conjunto_id
   where t.referencia = p_referencia;
$$;

-- ---------------------------------------------------------------------------------------------
-- Aplicar el estado que reporta Wompi
-- ---------------------------------------------------------------------------------------------

-- Devuelve el estado final de la transacción (null si la referencia no existe).
-- APPROVED descuenta el saldo una sola vez; VOIDED devuelve lo descontado; un pago que ya
-- terminó no vuelve a PENDIENTE aunque los eventos lleguen desordenados.
create or replace function public.aplicar_estado_wompi(
  p_referencia text,
  p_wompi_id text,
  p_estado_wompi text,
  p_medio text default null
)
returns public.estado_transaccion
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.transacciones_pago%rowtype;
  v_nuevo public.estado_transaccion;
  v_saldo numeric(18, 2);
  v_aplicado numeric(18, 2);
begin
  select * into v_tx from public.transacciones_pago where referencia = p_referencia for update;
  if v_tx.id is null then
    return null;
  end if;

  v_nuevo := case upper(coalesce(p_estado_wompi, ''))
    when 'APPROVED' then 'APROBADA'
    when 'DECLINED' then 'RECHAZADA'
    when 'ERROR' then 'ERROR'
    when 'VOIDED' then 'ANULADA'
    when 'PENDING' then 'PENDIENTE'
  end;
  if v_nuevo is null then
    raise exception 'estado_wompi_desconocido: %', p_estado_wompi;
  end if;
  if v_nuevo = 'PENDIENTE' and v_tx.estado <> 'PENDIENTE' then
    v_nuevo := v_tx.estado;
  end if;

  v_aplicado := v_tx.monto_aplicado;
  if v_nuevo = 'APROBADA' and v_aplicado is null then
    -- Un pago sin saldo pendiente (p. ej. una cuota extra) no deja el saldo en negativo.
    select saldo into v_saldo from public.cartera
     where unidad_id = v_tx.unidad_id and concepto_id = v_tx.concepto_id for update;
    v_aplicado := least(coalesce(v_saldo, 0), v_tx.monto);
    if v_aplicado > 0 then
      update public.cartera set saldo = saldo - v_aplicado, updated_at = now()
       where unidad_id = v_tx.unidad_id and concepto_id = v_tx.concepto_id;
    end if;
  elsif v_nuevo = 'ANULADA' and coalesce(v_aplicado, 0) > 0 then
    update public.cartera set saldo = saldo + v_aplicado, updated_at = now()
     where unidad_id = v_tx.unidad_id and concepto_id = v_tx.concepto_id;
    v_aplicado := 0;
  end if;

  update public.transacciones_pago
     set estado = v_nuevo,
         wompi_id = coalesce(p_wompi_id, wompi_id),
         medio_pago = coalesce(p_medio, medio_pago),
         monto_aplicado = v_aplicado,
         updated_at = now()
   where id = v_tx.id;
  return v_nuevo;
end;
$$;

-- Webhook: registra el evento y aplica el estado en una sola transacción.
-- Devuelve 'duplicado' (ya se había procesado), 'desconocido' (referencia ajena) o el estado final.
create or replace function public.procesar_evento_wompi(p_checksum text, p_evento jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx jsonb := p_evento -> 'data' -> 'transaction';
  v_id uuid;
  v_estado public.estado_transaccion;
  v_resultado text;
begin
  insert into public.eventos_wompi (checksum, evento, referencia, wompi_id, estado, payload)
  values (upper(p_checksum), p_evento ->> 'event', v_tx ->> 'reference', v_tx ->> 'id', v_tx ->> 'status', p_evento)
  on conflict (checksum) do nothing
  returning id into v_id;
  if v_id is null then
    return 'duplicado';
  end if;

  v_estado := public.aplicar_estado_wompi(v_tx ->> 'reference', v_tx ->> 'id', v_tx ->> 'status', v_tx ->> 'payment_method_type');
  v_resultado := coalesce(v_estado::text, 'desconocido');
  update public.eventos_wompi set resultado = v_resultado where id = v_id;
  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Conciliación automática
-- ---------------------------------------------------------------------------------------------

create or replace function public.pendientes_por_conciliar(p_minutos integer default 30)
returns table (referencia text)
language sql
stable
security definer
set search_path = ''
as $$
  select referencia from public.transacciones_pago
   where estado = 'PENDIENTE' and created_at < now() - make_interval(mins => p_minutos)
   order by created_at
   limit 100;
$$;

-- Pago que nunca llegó a Wompi (la persona no lo terminó): se cancela para no bloquear nuevos pagos.
create or replace function public.cancelar_pago_abandonado(p_referencia text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.transacciones_pago
     set estado = 'CANCELADA', updated_at = now()
   where referencia = p_referencia and estado = 'PENDIENTE' and wompi_id is null;
$$;

-- La tarea programada se identifica con un token guardado en el Vault («conciliacion_token»).
create or replace function public.token_conciliacion_valido(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_token is not null and p_token = (
    select decrypted_secret from vault.decrypted_secrets where name = 'conciliacion_token'
  );
$$;

-- Cada 15 minutos llama a la Edge Function wompi-conciliar.
select cron.schedule(
  'conciliar-pagos-wompi',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/wompi-conciliar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-conciliacion-token', (select decrypted_secret from vault.decrypted_secrets where name = 'conciliacion_token')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución: todo esto lo usa solo el servidor (service_role) o el SQL Editor
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.secreto_wompi(uuid, text) from public, anon, authenticated;
revoke execute on function public.guardar_secreto_vault(text, text) from public, anon, authenticated;
revoke execute on function public.configurar_wompi(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.credenciales_wompi(text) from public, anon, authenticated;
revoke execute on function public.aplicar_estado_wompi(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.procesar_evento_wompi(text, jsonb) from public, anon, authenticated;
revoke execute on function public.pendientes_por_conciliar(integer) from public, anon, authenticated;
revoke execute on function public.cancelar_pago_abandonado(text) from public, anon, authenticated;
revoke execute on function public.token_conciliacion_valido(text) from public, anon, authenticated;

grant execute on function public.credenciales_wompi(text) to service_role;
grant execute on function public.aplicar_estado_wompi(text, text, text, text) to service_role;
grant execute on function public.procesar_evento_wompi(text, jsonb) to service_role;
grant execute on function public.pendientes_por_conciliar(integer) to service_role;
grant execute on function public.cancelar_pago_abandonado(text) to service_role;
grant execute on function public.token_conciliacion_valido(text) to service_role;
