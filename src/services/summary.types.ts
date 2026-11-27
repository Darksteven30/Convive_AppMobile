// Tipos y contrato del resumen de General (RF14). Lo cumplen el servicio simulado (summary.mock.ts)
// y el de Supabase (summary.supabase.ts); las pantallas solo conocen este contrato vía summary.service.ts.

import type { User } from '@/services/auth.types';
import type { PqrsStatus, PqrsType } from '@/services/pqrs.types';

/** Opciones del selector de periodo de General (por defecto «Este mes»). */
export type SummaryPeriod = 'este_mes' | 'mes_anterior' | 'ultimos_3' | 'ultimos_6' | 'este_ano' | 'personalizado';

export const SUMMARY_PERIODS: { value: SummaryPeriod; label: string }[] = [
  { value: 'este_mes', label: 'Este mes' },
  { value: 'mes_anterior', label: 'Mes anterior' },
  { value: 'ultimos_3', label: 'Últimos 3 meses' },
  { value: 'ultimos_6', label: 'Últimos 6 meses' },
  { value: 'este_ano', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
];

/** Rango del resumen como texto ISO «aaaa-mm-dd». */
export type SummaryRange = { from: string; to: string };

export type SummaryRangeErrors = Partial<Record<'from' | 'to', string>>;

/** Como en RF04: el periodo personalizado es de máximo 12 meses. */
export const SUMMARY_MAX_MONTHS = 12;

/** Quién ve General: administrador, junta directiva y residente (solo lectura). Vigilancia no. */
export const SUMMARY_ROLES: User['role'][] = ['administrador', 'junta_directiva', 'residente'];

export type MonthTotals = {
  /** «2026-11» */
  month: string;
  income: number;
  expenses: number;
};

export type FinancialSummary = {
  /** Dinero del conjunto al empezar a usar Convive (lo define el administrador; empieza en 0). */
  initialBalance: number;
  /** Saldo inicial + ingresos − egresos registrados hasta hoy. No depende del periodo. */
  balance: number;
  income: number;
  expenses: number;
  monthly: MonthTotals[];
  /** Egresos del periodo por categoría, de mayor a menor. */
  expenseCategories: { name: string; total: number }[];
  pqrsByType: { type: PqrsType; count: number }[];
  pqrsByStatus: { status: PqrsStatus; count: number }[];
  /** Reservas confirmadas y pendientes hechas en el periodo, por zona. */
  reservationsByZone: { zone: string; count: number }[];
};

export type SummaryErrorCode = 'forbidden' | 'invalid_range' | 'invalid_amount' | 'failed';

export class SummaryError extends Error {
  constructor(public readonly code: SummaryErrorCode) {
    super(code);
    this.name = 'SummaryError';
  }
}

/** Saldo inicial: igual que un monto de RF03, sin negativos y hasta $ 999.999.999,99. */
export const INITIAL_BALANCE_MAX = 999999999.99;

/** Funciones que debe ofrecer cada implementación del resumen. */
export type SummaryBackend = {
  /** Totales de General para el rango (valida el rango y el rol en el servidor). */
  getSummary(range: SummaryRange, user: User): Promise<FinancialSummary>;
  /** Saldo inicial del conjunto (solo el administrador). */
  getInitialBalance(user: User): Promise<number>;
  /** Cambia el saldo inicial del conjunto (solo el administrador). Devuelve el valor guardado. */
  setInitialBalance(amount: number, user: User): Promise<number>;
};
