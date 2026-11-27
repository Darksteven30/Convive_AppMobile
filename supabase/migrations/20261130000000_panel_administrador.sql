-- =============================================================================================
-- Convive · Panel del administrador con datos reales
--
-- La tarjeta «Cartera por cobrar» y el contador de «PQRS pendientes» del Panel mostraban valores
-- fijos del modo simulado ($ 12.450.000, 8 de 120 unidades y 3 PQRS), aunque la app estuviera
-- conectada a Supabase. resumen_panel() los calcula con los datos del conjunto del administrador:
--   · cartera:          suma de los saldos pendientes de todas las unidades (tabla cartera).
--   · unidades_en_mora: unidades con algún saldo pendiente mayor que $ 0.
--   · total_unidades:   unidades del conjunto.
--   · pqrs_pendientes:  PQRS del conjunto en estado «Pendiente» (aún sin respuesta).
-- Solo la usa el administrador (sin_permiso para los demás roles).
--
-- Requiere: autenticación, selección del concepto de pago (cartera) y PQRS.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

create or replace function public.resumen_panel()
returns table (
  cartera numeric,
  unidades_en_mora integer,
  total_unidades integer,
  pqrs_pendientes integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conjunto uuid := public.mi_conjunto();
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso';
  end if;

  return query
  with saldos as (
    select u.id, coalesce(sum(k.saldo), 0) as total
      from public.unidades u
      left join public.cartera k on k.unidad_id = u.id
     where u.conjunto_id = v_conjunto
     group by u.id
  )
  select
    coalesce((select sum(total) from saldos), 0)::numeric,
    (select count(*) from saldos where total > 0)::integer,
    (select count(*) from saldos)::integer,
    (select count(*) from public.pqrs p where p.conjunto_id = v_conjunto and p.estado = 'pendiente')::integer;
end;
$$;

revoke execute on function public.resumen_panel() from public, anon, authenticated;
grant execute on function public.resumen_panel() to authenticated;
