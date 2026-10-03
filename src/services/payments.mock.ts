// Servicio de pagos simulado (mock). Se usa cuando la app no tiene configurado Supabase (y siempre
// en las pruebas). Replica los datos de supabase/seed.sql: catálogo de conceptos y cartera por unidad.

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import { buildAccountStatus, type AccountStatus, type PaymentsBackend } from '@/services/payments.types';

const catalog = [
  { id: 'administracion', name: 'Cuota administración', requiresDescription: false },
  { id: 'extraordinaria', name: 'Cuota extraordinaria', requiresDescription: false },
  { id: 'otros', name: 'Otros conceptos', requiresDescription: true },
];

/** Saldo pendiente por unidad (User.house) y concepto. Las unidades que no aparecen están al día. */
const initialPortfolio: Record<string, Record<string, number>> = {
  '56': { administracion: 35_000, extraordinaria: 0, otros: 10_678.9 },
  '12': { administracion: 35_000 },
  '78': { administracion: 70_000 },
};

let portfolio: Record<string, Record<string, number>> = {};

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockPaymentsState() {
  portfolio = Object.fromEntries(
    Object.entries(initialPortfolio).map(([house, balances]) => [house, { ...balances }]),
  );
}
resetMockPaymentsState();

/** Solo para las pruebas: cambia el saldo de una unidad en un concepto. */
export function setMockBalance(house: string, conceptId: string, balance: number) {
  portfolio[house] = { ...portfolio[house], [conceptId]: balance };
}

export async function getAccountStatus(user: User): Promise<AccountStatus> {
  await simulateNetwork(0.5);
  const balances = portfolio[user.house] ?? {};
  return buildAccountStatus(catalog.map((concept) => ({ ...concept, balance: balances[concept.id] ?? 0 })));
}

/** Implementación del contrato PaymentsBackend que usa payments.service.ts. */
export const paymentsBackend = { getAccountStatus } satisfies PaymentsBackend;
