// Resumen de General simulado (RF14). Se usa cuando la app no tiene configurado Supabase (y siempre
// en las pruebas). Calcula los mismos totales que resumen_general() a partir de los datos simulados
// de finanzas, PQRS y reservas, y cumple el mismo contrato que summary.supabase.ts.

import type { User } from '@/services/auth.types';
import { mockUnitNames } from '@/services/community.mock';
import { mockMovements } from '@/services/finance.mock';
import { simulateNetwork } from '@/services/mockNetwork';
import { mockPortfolio } from '@/services/payments.mock';
import { mockPqrsTotals } from '@/services/pqrs.mock';
import type { PqrsStatus, PqrsType } from '@/services/pqrs.types';
import { mockReservations } from '@/services/reservations.mock';
import {
  SUMMARY_ROLES,
  SummaryError,
  type FinancialSummary,
  type MonthTotals,
  type PanelSummary,
  type SummaryBackend,
  type SummaryRange,
} from '@/services/summary.types';
import { isValidInitialBalance, validateSummaryRange } from '@/services/summary.validation';
import { addMonthsISO, startOfMonthISO, toISODate, todayISO } from '@/utils/date';

let initialBalance = 0;

/** Sumas de dinero sin errores de punto flotante (0,1 + 0,2 = 0,3). */
const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Restaura el saldo inicial (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockSummaryState() {
  initialBalance = 0;
}

/** Suma por clave y devuelve de mayor a menor (desempate por nombre), como el servidor. */
function countBy<K extends string>(keys: K[]): { key: K; count: number }[] {
  const counts = new Map<K, number>();
  keys.forEach((key) => counts.set(key, (counts.get(key) ?? 0) + 1));
  return [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Un registro por mes del rango, aunque no tenga movimientos. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = startOfMonthISO(from); month <= to; month = addMonthsISO(month, 1)) {
    months.push(month.slice(0, 7));
  }
  return months;
}

async function getSummary(range: SummaryRange, user: User): Promise<FinancialSummary> {
  await simulateNetwork();
  if (!SUMMARY_ROLES.includes(user.role)) throw new SummaryError('forbidden');
  if (Object.keys(validateSummaryRange(range)).length > 0) throw new SummaryError('invalid_range');

  const today = todayISO();
  const movements = mockMovements();
  const inRange = movements.filter((m) => m.date >= range.from && m.date <= range.to);
  const sum = (items: typeof movements, type: 'ingreso' | 'egreso') =>
    roundMoney(items.filter((m) => m.type === type).reduce((total, m) => total + m.amount, 0));

  const monthly: MonthTotals[] = monthsBetween(range.from, range.to).map((month) => {
    const ofMonth = inRange.filter((m) => m.date.startsWith(month));
    return { month, income: sum(ofMonth, 'ingreso'), expenses: sum(ofMonth, 'egreso') };
  });

  const expenseTotals = new Map<string, number>();
  inRange
    .filter((m) => m.type === 'egreso')
    .forEach((m) => expenseTotals.set(m.categoryName, roundMoney((expenseTotals.get(m.categoryName) ?? 0) + m.amount)));

  const pqrs = mockPqrsTotals().filter((p) => {
    const date = toISODate(new Date(p.createdAt));
    return date >= range.from && date <= range.to;
  });
  // Como el servidor, cuenta las reservas hechas en el periodo. En el modo simulado no se guarda cuándo
  // se hizo cada una: todas (las de ejemplo y las nuevas) se consideran hechas hoy.
  const reservations = today >= range.from && today <= range.to ? mockReservations() : [];
  const upToToday = movements.filter((m) => m.date <= today);

  return {
    initialBalance,
    balance: roundMoney(initialBalance + sum(upToToday, 'ingreso') - sum(upToToday, 'egreso')),
    income: sum(inRange, 'ingreso'),
    expenses: sum(inRange, 'egreso'),
    monthly,
    expenseCategories: [...expenseTotals]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    pqrsByType: countBy<PqrsType>(pqrs.map((p) => p.type)).map(({ key, count }) => ({ type: key, count })),
    pqrsByStatus: countBy<PqrsStatus>(pqrs.map((p) => p.status))
      .map(({ key, count }) => ({ status: key, count }))
      .sort((a, b) => a.status.localeCompare(b.status)),
    reservationsByZone: countBy(reservations.map((r) => r.zoneName)).map(({ key, count }) => ({ zone: key, count })),
  };
}

async function getInitialBalance(user: User): Promise<number> {
  await simulateNetwork(0.5);
  if (user.role !== 'administrador') throw new SummaryError('forbidden');
  return initialBalance;
}

async function setInitialBalance(amount: number, user: User): Promise<number> {
  await simulateNetwork();
  if (user.role !== 'administrador') throw new SummaryError('forbidden');
  if (!isValidInitialBalance(amount)) throw new SummaryError('invalid_amount');
  initialBalance = amount;
  return initialBalance;
}

/** Panel del administrador: los mismos cálculos que resumen_panel() con los datos simulados. */
async function getPanelSummary(user: User): Promise<PanelSummary> {
  await simulateNetwork(0.5);
  if (user.role !== 'administrador') throw new SummaryError('forbidden');
  const portfolio = mockPortfolio();
  const unitTotals = mockUnitNames().map((name) =>
    roundMoney(Object.values(portfolio[name] ?? {}).reduce((total, balance) => total + balance, 0)),
  );
  return {
    portfolioDue: roundMoney(unitTotals.reduce((total, balance) => total + balance, 0)),
    unitsInArrears: unitTotals.filter((balance) => balance > 0).length,
    totalUnits: unitTotals.length,
    pendingPqrs: mockPqrsTotals().filter((item) => item.status === 'pendiente').length,
  };
}

/** Implementación del contrato SummaryBackend que usa summary.service.ts. */
export const summaryBackend = {
  getSummary,
  getInitialBalance,
  setInitialBalance,
  getPanelSummary,
} satisfies SummaryBackend;
