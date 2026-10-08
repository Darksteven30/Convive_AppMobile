-- =============================================================================================
-- Convive · Monto mínimo de Wompi (corrección del QA del 2026-10-06)
-- =============================================================================================
-- Wompi rechaza transacciones por debajo de $ 1.500 COP: la ventana de pago muestra «El monto
-- mínimo de una transacción es $1,500» y el residente queda sin poder pagar. La app ya no deja
-- continuar con menos (payments.validation.ts, WOMPI_MIN_AMOUNT); el servidor aplica la misma
-- regla para no depender de la app. Igual que antes, el error es valor_invalido.
--
-- «create or replace» conserva los permisos de ejecución de 20261005000000_pago_wompi.sql.

create or replace function public.iniciar_pago(p_concepto_id text, p_valor numeric, p_descripcion text default null)
returns table (
  transaccion_id uuid,
  referencia text,
  monto_centavos bigint,
  moneda text,
  firma text,
  llave_publica text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
-- Las columnas de salida (referencia, firma…) se llaman igual que las de la tabla.
#variable_conflict use_column
declare
  v_perfil public.perfiles%rowtype;
  v_unidad public.unidades%rowtype;
  v_concepto public.conceptos_pago%rowtype;
  v_saldo numeric(18, 2);
  v_descripcion text := nullif(btrim(coalesce(p_descripcion, '')), '');
  v_pendiente uuid;
  v_wompi public.wompi_conjuntos%rowtype;
  v_secreto text;
  v_referencia text;
  v_centavos bigint;
  v_firma text;
  v_id uuid;
begin
  select * into v_perfil from public.perfiles where user_id = auth.uid();
  if v_perfil.id is null or v_perfil.unidad_id is null then
    raise exception 'sin_unidad' using errcode = 'P0002';
  end if;
  select * into v_unidad from public.unidades where id = v_perfil.unidad_id;

  -- Las mismas reglas de RF11: la app valida para guiar, pero el servidor no confía en ella.
  select * into v_concepto from public.conceptos_pago where id = p_concepto_id and activo;
  if v_concepto.id is null then
    raise exception 'concepto_invalido' using errcode = '22023';
  end if;

  select coalesce((select saldo from public.cartera
                    where unidad_id = v_unidad.id and concepto_id = v_concepto.id), 0)
    into v_saldo;
  -- Wompi no acepta transacciones de menos de $ 1.500 COP.
  if p_valor is null or p_valor < 1500 or p_valor <> round(p_valor, 2) or p_valor > 999999999.99
     or (v_saldo > 0 and p_valor > v_saldo) then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;

  if v_concepto.requiere_descripcion and (v_descripcion is null or char_length(v_descripcion) not between 5 and 100) then
    raise exception 'descripcion_invalida' using errcode = '22023';
  end if;
  if not v_concepto.requiere_descripcion then
    v_descripcion := null;
  end if;

  -- MSG-RF12-03: no se permite un segundo pago del mismo concepto mientras haya uno en proceso.
  select id into v_pendiente from public.transacciones_pago
   where unidad_id = v_unidad.id and concepto_id = v_concepto.id and estado = 'PENDIENTE';
  if v_pendiente is not null then
    raise exception 'pago_pendiente' using errcode = 'P0001', detail = v_pendiente::text;
  end if;

  -- MSG-RF12-04: el conjunto debe tener su cuenta Wompi activa (llave pública y secreto).
  select * into v_wompi from public.wompi_conjuntos where conjunto_id = v_unidad.conjunto_id and activo;
  v_secreto := public.secreto_integridad_wompi(v_unidad.conjunto_id);
  if v_wompi.llave_publica is null or v_secreto is null then
    raise exception 'wompi_no_disponible' using errcode = 'P0001';
  end if;

  -- CNV-{unidad}-{aaaammddhhmmss}-{aleatorio}: única por unidad y momento, incluso en reintentos.
  v_referencia := 'CNV-' || left(regexp_replace(v_unidad.nombre, '[^A-Za-z0-9]', '', 'g'), 20)
    || '-' || to_char(now() at time zone 'America/Bogota', 'YYYYMMDDHH24MISS')
    || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
  v_centavos := (p_valor * 100)::bigint;
  v_firma := encode(extensions.digest(v_referencia || v_centavos::text || 'COP' || v_secreto, 'sha256'), 'hex');

  begin
    insert into public.transacciones_pago
      (unidad_id, concepto_id, descripcion, monto, monto_centavos, moneda, referencia, firma, creada_por)
    values
      (v_unidad.id, v_concepto.id, v_descripcion, p_valor, v_centavos, 'COP', v_referencia, v_firma, v_perfil.id)
    returning id into v_id;
  exception when unique_violation then
    -- Dos pulsaciones simultáneas: el índice único deja pasar solo una.
    select id into v_pendiente from public.transacciones_pago
     where unidad_id = v_unidad.id and concepto_id = v_concepto.id and estado = 'PENDIENTE';
    raise exception 'pago_pendiente' using errcode = 'P0001', detail = coalesce(v_pendiente::text, '');
  end;

  return query select v_id, v_referencia, v_centavos, 'COP'::text, v_firma, v_wompi.llave_publica;
end;
$$;
