-- =============================================================================================
-- Convive · RF14: resumen financiero (pantalla General)
--
-- General muestra el saldo del conjunto, los ingresos y egresos del periodo, el movimiento de
-- fondos por mes, los egresos por categoría y la cantidad de PQRS radicadas y de reservas hechas en
-- el periodo. La ven el
-- administrador, la junta directiva y el residente (solo lectura); vigilancia no.
--
-- El residente no puede leer los movimientos (RLS de 20261012000000_finanzas.sql) ni las PQRS y
-- reservas de otras unidades, así que resumen_general() es security definer y devuelve SOLO
-- totales agregados del conjunto de la sesión: nunca una fila, un nombre o una unidad.
--
-- Saldo actual general = saldo inicial del conjunto + ingresos − egresos registrados hasta hoy.
-- El saldo inicial es el dinero que tenía el conjunto al empezar a usar Convive: empieza en 0 y
-- solo el administrador lo cambia (configurar_saldo_inicial()).
--
-- Requiere: autenticación, finanzas, reservas y PQRS (20261003, 20261012, 20261015, 20261022).
-- Cómo aplicarlo: Supabase → SQL Editor → pegar este archivo → Run (o `supabase db push`).
-- =============================================================================================

alter table public.conjuntos
  add column saldo_inicial numeric(18, 2) not null default 0
  check (saldo_inicial >= 0 and saldo_inicial <= 999999999.99);

-- ---------------------------------------------------------------------------------------------
-- Saldo inicial (solo el administrador de su conjunto)
-- ---------------------------------------------------------------------------------------------

create or replace function public.saldo_inicial_conjunto()
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso';
  end if;
  return (select saldo_inicial from public.conjuntos where id = public.mi_conjunto());
end;
$$;

create or replace function public.configurar_saldo_inicial(p_monto numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.mi_rol() is distinct from 'administrador' then
    raise exception 'sin_permiso';
  end if;
  if p_monto is null or p_monto < 0 or p_monto > 999999999.99 or p_monto <> round(p_monto, 2) then
    raise exception 'monto_invalido';
  end if;

  update public.conjuntos set saldo_inicial = p_monto where id = public.mi_conjunto();
  return p_monto;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Resumen de General (RF14)
-- ---------------------------------------------------------------------------------------------

create or replace function public.resumen_general(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_conjunto uuid := public.mi_conjunto();
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_resultado jsonb;
begin
  if public.mi_rol() is null or public.mi_rol() not in ('administrador', 'junta_directiva', 'residente') then
    raise exception 'sin_permiso';
  end if;
  -- Mismas reglas que la app: inicial ≤ final, final no posterior a hoy y máximo 12 meses.
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta > v_hoy
     or p_hasta > (p_desde + interval '12 months')::date then
    raise exception 'rango_invalido';
  end if;

  select jsonb_build_object(
    'saldo_inicial', c.saldo_inicial,
    'saldo_actual', c.saldo_inicial + coalesce((
      select sum(case when m.tipo = 'ingreso' then m.monto else -m.monto end)
        from public.movimientos m
       where m.conjunto_id = v_conjunto and m.fecha <= v_hoy
    ), 0),
    'ingresos', coalesce((
      select sum(m.monto) from public.movimientos m
       where m.conjunto_id = v_conjunto and m.tipo = 'ingreso' and m.fecha between p_desde and p_hasta
    ), 0),
    'egresos', coalesce((
      select sum(m.monto) from public.movimientos m
       where m.conjunto_id = v_conjunto and m.tipo = 'egreso' and m.fecha between p_desde and p_hasta
    ), 0),
    -- Un registro por mes del periodo, aunque no tenga movimientos (la gráfica muestra todos los meses).
    'mensual', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'mes', to_char(meses.mes, 'YYYY-MM'),
               'ingresos', coalesce(t.ingresos, 0),
               'egresos', coalesce(t.egresos, 0)) order by meses.mes), '[]'::jsonb)
        from generate_series(date_trunc('month', p_desde), date_trunc('month', p_hasta), interval '1 month') as meses (mes)
        left join (
          select date_trunc('month', m.fecha) as mes,
                 sum(m.monto) filter (where m.tipo = 'ingreso') as ingresos,
                 sum(m.monto) filter (where m.tipo = 'egreso') as egresos
            from public.movimientos m
           where m.conjunto_id = v_conjunto and m.fecha between p_desde and p_hasta
           group by 1
        ) t on t.mes = meses.mes
    ),
    'gastos_por_categoria', (
      select coalesce(jsonb_agg(jsonb_build_object('categoria', g.nombre, 'total', g.total) order by g.total desc, g.nombre), '[]'::jsonb)
        from (
          select cf.nombre, sum(m.monto) as total
            from public.movimientos m
            join public.categorias_financieras cf on cf.id = m.categoria_id
           where m.conjunto_id = v_conjunto and m.tipo = 'egreso' and m.fecha between p_desde and p_hasta
           group by cf.nombre
        ) g
    ),
    'pqrs_por_tipo', (
      select coalesce(jsonb_agg(jsonb_build_object('tipo', p.tipo, 'cantidad', p.cantidad) order by p.cantidad desc, p.tipo), '[]'::jsonb)
        from (
          select q.tipo, count(*) as cantidad
            from public.pqrs q
           where q.conjunto_id = v_conjunto
             and (q.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
           group by q.tipo
        ) p
    ),
    'pqrs_por_estado', (
      select coalesce(jsonb_agg(jsonb_build_object('estado', p.estado, 'cantidad', p.cantidad) order by p.estado), '[]'::jsonb)
        from (
          select q.estado, count(*) as cantidad
            from public.pqrs q
           where q.conjunto_id = v_conjunto
             and (q.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
           group by q.estado
        ) p
    ),
    -- Reservas hechas en el periodo (como las PQRS, por la fecha en que se crearon: casi siempre son
    -- para días que aún no llegan) que ocupan la zona: confirmadas y pendientes.
    'reservas_por_zona', (
      select coalesce(jsonb_agg(jsonb_build_object('zona', r.nombre, 'cantidad', r.cantidad) order by r.cantidad desc, r.nombre), '[]'::jsonb)
        from (
          select z.nombre, count(*) as cantidad
            from public.reservas re
            join public.zonas_comunes z on z.id = re.zona_id
           where re.conjunto_id = v_conjunto
             and re.estado in ('confirmada', 'pendiente')
             and (re.created_at at time zone 'America/Bogota')::date between p_desde and p_hasta
           group by z.nombre
        ) r
    )
  )
  into v_resultado
  from public.conjuntos c
  where c.id = v_conjunto;

  return v_resultado;
end;
$$;

revoke execute on function public.saldo_inicial_conjunto() from public, anon, authenticated;
revoke execute on function public.configurar_saldo_inicial(numeric) from public, anon, authenticated;
revoke execute on function public.resumen_general(date, date) from public, anon, authenticated;
grant execute on function public.saldo_inicial_conjunto() to authenticated;
grant execute on function public.configurar_saldo_inicial(numeric) to authenticated;
grant execute on function public.resumen_general(date, date) to authenticated;
