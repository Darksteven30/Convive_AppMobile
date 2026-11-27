-- =============================================================================================
-- Convive · Corrección RF15: un pago aprobado o anulado ya no cambia con eventos tardíos de Wompi
--
-- Antes, aplicar_estado_wompi() solo impedía volver a PENDIENTE y aceptaba cualquier otro cambio:
--   · Eventos fuera de orden o varios intentos con la misma referencia: llegaba APPROVED y después
--     un DECLINED tardío de otro intento. El pago quedaba RECHAZADA con el saldo ya descontado.
--   · APPROVED repetido después de un VOIDED: volvía a APROBADA con monto_aplicado = 0 (se veía
--     pagado aunque el saldo ya se había devuelto).
--
-- Ahora:
--   · ANULADA es final: se ignora cualquier evento posterior.
--   · APROBADA solo puede pasar a ANULADA, y solo con el VOIDED de la misma transacción de Wompi
--     (mismo wompi_id). Los demás eventos se ignoran.
--   · Un pago RECHAZADO, con ERROR o CANCELADO sí puede pasar a APROBADA: es otro intento con la
--     misma referencia que Wompi sí cobró, así que hay que descontar el saldo.
-- Cuando un evento se ignora, la transacción no cambia (tampoco su wompi_id) y se devuelve su
-- estado actual, así el webhook y la conciliación responden como siempre.
--
-- Requiere: 20261006000000_integracion_wompi.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

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

  -- Estados finales: un evento que no corresponde se ignora sin tocar la transacción.
  if v_tx.estado = 'ANULADA' and v_nuevo <> 'ANULADA' then
    return v_tx.estado;
  end if;
  if v_tx.estado = 'APROBADA' and (
       v_nuevo not in ('APROBADA', 'ANULADA')
       or (p_wompi_id is not null and v_tx.wompi_id is not null and p_wompi_id <> v_tx.wompi_id)
     ) then
    return v_tx.estado;
  end if;
  -- Un pago que ya terminó no vuelve a PENDIENTE.
  if v_nuevo = 'PENDIENTE' and v_tx.estado <> 'PENDIENTE' then
    return v_tx.estado;
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

-- Los permisos no cambian: create or replace conserva los de 20261006000000_integracion_wompi.sql.
