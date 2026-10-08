-- =============================================================================================
-- Convive · Estado de cuenta e historial de pagos (RF02)
--
-- «Historial de pagos» muestra los pagos APROBADOS de la unidad de quien tiene la sesión, del más
-- reciente al más antiguo, dentro del periodo elegido. La unidad sale del token (mi_unidad()),
-- nunca de un dato enviado por la app.
--
-- Por qué una función y no un select directo: la política «La administración ve los pagos de su
-- conjunto» deja al administrador leer los pagos de todas las unidades, y el estado de cuenta es
-- solo el de la propia unidad.
--
-- Requiere: 20261005000000_pago_wompi.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

-- Fechas en la hora de Colombia: «hasta el 31/10» incluye todo ese día.
-- Error rango_invalido (MSG-RF02-02) si la fecha inicial es mayor que la final.
create or replace function public.mi_historial_pagos(p_desde date, p_hasta date)
returns table (
  referencia text,
  concepto_id text,
  concepto text,
  descripcion text,
  monto numeric,
  medio_pago text,
  wompi_id text,
  fecha timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;

  return query
    select t.referencia, t.concepto_id, c.nombre, t.descripcion, t.monto, t.medio_pago, t.wompi_id, t.created_at
      from public.transacciones_pago t
      join public.conceptos_pago c on c.id = t.concepto_id
     where t.unidad_id = public.mi_unidad()
       and t.estado = 'APROBADA'
       and t.created_at >= (p_desde::timestamp at time zone 'America/Bogota')
       and t.created_at < ((p_hasta + 1)::timestamp at time zone 'America/Bogota')
     order by t.created_at desc;
end;
$$;

revoke execute on function public.mi_historial_pagos(date, date) from public, anon, authenticated;
grant execute on function public.mi_historial_pagos(date, date) to authenticated;
