// Resumen de General con Supabase (RF14). Cumple el mismo contrato que el servicio simulado
// (summary.types.ts). Las funciones están en supabase/migrations/20261126000000_resumen_general.sql:
// resumen_general() devuelve solo totales agregados del conjunto de la sesión (el residente no puede
// leer movimientos ni PQRS y reservas de otras unidades) y configurar_saldo_inicial() es del administrador.

import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import type { PqrsStatus, PqrsType } from '@/services/pqrs.types';
import {
  SUMMARY_ROLES,
  SummaryError,
  type FinancialSummary,
  type SummaryBackend,
  type SummaryRange,
} from '@/services/summary.types';
import { isValidInitialBalance, validateSummaryRange } from '@/services/summary.validation';

/** numeric(18,2): PostgREST puede devolverlo como número o como texto. */
type Amount = number | string;

/** Lo que devuelve resumen_general() (jsonb). */
type SummaryRow = {
  saldo_inicial: Amount;
  saldo_actual: Amount;
  ingresos: Amount;
  egresos: Amount;
  mensual: { mes: string; ingresos: Amount; egresos: Amount }[];
  gastos_por_categoria: { categoria: string; total: Amount }[];
  pqrs_por_tipo: { tipo: PqrsType; cantidad: number }[];
  pqrs_por_estado: { estado: PqrsStatus; cantidad: number }[];
  reservas_por_zona: { zona: string; cantidad: number }[];
};

type RpcError = { message?: string };

/** Traduce los errores de las funciones del servidor al contrato de la app. */
function toSummaryError(error: RpcError): SummaryError {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new SummaryError('forbidden');
  if (message.includes('rango_invalido')) return new SummaryError('invalid_range');
  if (message.includes('monto_invalido')) return new SummaryError('invalid_amount');
  return new SummaryError('failed');
}

export function toFinancialSummary(row: SummaryRow): FinancialSummary {
  return {
    initialBalance: Number(row.saldo_inicial),
    balance: Number(row.saldo_actual),
    income: Number(row.ingresos),
    expenses: Number(row.egresos),
    monthly: row.mensual.map((m) => ({ month: m.mes, income: Number(m.ingresos), expenses: Number(m.egresos) })),
    expenseCategories: row.gastos_por_categoria.map((c) => ({ name: c.categoria, total: Number(c.total) })),
    pqrsByType: row.pqrs_por_tipo.map((p) => ({ type: p.tipo, count: Number(p.cantidad) })),
    pqrsByStatus: row.pqrs_por_estado.map((p) => ({ status: p.estado, count: Number(p.cantidad) })),
    reservationsByZone: row.reservas_por_zona.map((r) => ({ zone: r.zona, count: Number(r.cantidad) })),
  };
}

async function getSummary(range: SummaryRange, user: User): Promise<FinancialSummary> {
  // El servidor repite estas reglas; aquí se evita una llamada que de todas formas fallaría.
  if (!SUMMARY_ROLES.includes(user.role)) throw new SummaryError('forbidden');
  if (Object.keys(validateSummaryRange(range)).length > 0) throw new SummaryError('invalid_range');

  const { data, error } = await getSupabase().rpc('resumen_general', { p_desde: range.from, p_hasta: range.to });
  if (error) throw toSummaryError(error);
  if (!data) throw new SummaryError('failed');
  return toFinancialSummary(data as SummaryRow);
}

async function getInitialBalance(user: User): Promise<number> {
  if (user.role !== 'administrador') throw new SummaryError('forbidden');
  const { data, error } = await getSupabase().rpc('saldo_inicial_conjunto');
  if (error) throw toSummaryError(error);
  return Number(data ?? 0);
}

async function setInitialBalance(amount: number, user: User): Promise<number> {
  if (user.role !== 'administrador') throw new SummaryError('forbidden');
  if (!isValidInitialBalance(amount)) throw new SummaryError('invalid_amount');
  const { data, error } = await getSupabase().rpc('configurar_saldo_inicial', { p_monto: amount });
  if (error) throw toSummaryError(error);
  return Number(data);
}

/** Implementación del contrato SummaryBackend que usa summary.service.ts. */
export const summaryBackend = {
  getSummary,
  getInitialBalance,
  setInitialBalance,
} satisfies SummaryBackend;
