-- =============================================================================================
-- Convive · RF09 (parte 2): aviso «Tu pago vence pronto»
--
-- El administrador define en Finanzas el día del mes en que vence la cuota del conjunto (1 a 28,
-- para que exista en todos los meses; vacío = no se envían avisos). Todos los días a las 8:00 a. m.
-- (hora de Colombia) una tarea de pg_cron avisa a las personas de cada unidad con saldo pendiente
-- en la cartera:
--   · 5 días antes: «Tu pago vence pronto» con el saldo y la fecha.
--   · El mismo día: «Tu pago vence hoy».
-- El aviso es una fila de «notificaciones» (tipo pago_por_vencer), así que el trigger de
-- 20261127000000_notificaciones_push.sql lo envía como push y al tocarlo abre /pago/seleccion.
--
-- Requiere: autenticación, selección del concepto de pago (cartera) y 20261127000000_notificaciones_push.sql.
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

alter table public.conjuntos
  add column dia_vencimiento smallint check (dia_vencimiento between 1 and 28);

-- ---------------------------------------------------------------------------------------------
-- Día de vencimiento (solo el administrador de su conjunto)
-- ---------------------------------------------------------------------------------------------

create or replace function public.dia_vencimiento_conjunto()
returns smallint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso';
  end if;
  return (select dia_vencimiento from public.conjuntos where id = public.mi_conjunto());
end;
$$;

-- p_dia null quita el día de vencimiento (y con él, los avisos).
create or replace function public.configurar_dia_vencimiento(p_dia integer)
returns smallint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso';
  end if;
  if p_dia is not null and (p_dia < 1 or p_dia > 28) then
    raise exception 'dia_invalido';
  end if;

  update public.conjuntos set dia_vencimiento = p_dia where id = public.mi_conjunto();
  return p_dia;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Avisos del día (los llama pg_cron; p_hoy solo se pasa en las pruebas)
-- ---------------------------------------------------------------------------------------------

-- Devuelve cuántos avisos creó. No repite el aviso a la misma persona si la tarea corre dos veces
-- el mismo día.
create or replace function public.avisar_pagos_por_vencer(p_hoy date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := coalesce(p_hoy, (now() at time zone 'America/Bogota')::date);
  v_dia_hoy integer := extract(day from v_hoy)::integer;
  v_dia_en_5 integer := extract(day from v_hoy + 5)::integer;
  v_fila record;
  v_titulo text;
  v_mensaje text;
  v_cantidad integer := 0;
begin
  for v_fila in
    select p.id as perfil_id, c.dia_vencimiento, saldos.total
      from public.conjuntos c
      join public.unidades u on u.conjunto_id = c.id
      join lateral (
        select sum(k.saldo) as total from public.cartera k where k.unidad_id = u.id
      ) saldos on saldos.total > 0
      join public.perfiles p on p.unidad_id = u.id
     where c.dia_vencimiento in (v_dia_hoy, v_dia_en_5)
  loop
    if v_fila.dia_vencimiento = v_dia_hoy then
      v_titulo := 'Tu pago vence hoy';
      v_mensaje := 'Hoy vence tu saldo pendiente de ' || public.formato_pesos(v_fila.total) || '.';
    else
      v_titulo := 'Tu pago vence pronto';
      v_mensaje := 'Tu saldo pendiente de ' || public.formato_pesos(v_fila.total)
        || ' vence el ' || to_char(v_hoy + 5, 'DD/MM') || '.';
    end if;

    if not exists (
      select 1 from public.notificaciones n
       where n.perfil_id = v_fila.perfil_id
         and n.tipo = 'pago_por_vencer'
         and n.titulo = v_titulo
         and n.created_at > now() - interval '20 hours'
    ) then
      insert into public.notificaciones (perfil_id, tipo, titulo, mensaje)
      values (v_fila.perfil_id, 'pago_por_vencer', v_titulo, v_mensaje);
      v_cantidad := v_cantidad + 1;
    end if;
  end loop;

  return v_cantidad;
end;
$$;

-- Todos los días a las 13:00 UTC = 8:00 a. m. en Colombia (UTC−5, sin horario de verano).
select cron.schedule(
  'avisar-pagos-por-vencer',
  '0 13 * * *',
  $$ select public.avisar_pagos_por_vencer(); $$
);

-- ---------------------------------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------------------------------

revoke execute on function public.dia_vencimiento_conjunto() from public, anon, authenticated;
revoke execute on function public.configurar_dia_vencimiento(integer) from public, anon, authenticated;
revoke execute on function public.avisar_pagos_por_vencer(date) from public, anon, authenticated;

grant execute on function public.dia_vencimiento_conjunto() to authenticated;
grant execute on function public.configurar_dia_vencimiento(integer) to authenticated;
-- avisar_pagos_por_vencer() solo la ejecutan pg_cron y el SQL Editor (postgres).
