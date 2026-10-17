// Servicio de finanzas simulado (mock) para RF03 y RF04. Se usa cuando la app no tiene configurado
// Supabase (y siempre en las pruebas). Replica el catálogo de categorías y los movimientos de
// ejemplo de supabase/seed.sql, y las validaciones de registrar_movimiento() en el servidor.

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  ALL_CATEGORIES,
  FinanceError,
  MOVEMENT_ROLES,
  REPORT_ROLES,
  byName,
  byTypeAndName,
  newestFirst,
  oldestFirst,
  type Category,
  type FinanceBackend,
  type FinancialReport,
  type Movement,
  type MovementInput,
  type MovementType,
  type ReportErrors,
  type ReportFilters,
} from '@/services/finance.types';
import { computeTotals, validateMovement, validateReportFilters } from '@/services/finance.validation';

/** Catálogo de categorías: el mismo de la migración 20261012000000_finanzas.sql. */
export const MOCK_CATEGORIES: Category[] = [
  { id: 'ing-admin', name: 'Cuotas de administración', type: 'ingreso', active: true },
  { id: 'ing-extra', name: 'Cuotas extraordinarias', type: 'ingreso', active: true },
  { id: 'ing-zonas', name: 'Alquiler de zonas comunes', type: 'ingreso', active: true },
  { id: 'ing-multas', name: 'Multas e intereses', type: 'ingreso', active: true },
  { id: 'ing-otros', name: 'Otros ingresos', type: 'ingreso', active: true },
  { id: 'ing-donaciones', name: 'Donaciones', type: 'ingreso', active: false },
  { id: 'egr-nomina', name: 'Nómina', type: 'egreso', active: true },
  { id: 'egr-mantenimiento', name: 'Mantenimiento', type: 'egreso', active: true },
  { id: 'egr-servicios', name: 'Servicios públicos', type: 'egreso', active: true },
  { id: 'egr-vigilancia', name: 'Vigilancia y seguridad', type: 'egreso', active: true },
  { id: 'egr-aseo', name: 'Aseo', type: 'egreso', active: true },
  { id: 'egr-papeleria', name: 'Papelería y administración', type: 'egreso', active: true },
  { id: 'egr-otros', name: 'Otros egresos', type: 'egreso', active: true },
  { id: 'egr-eventos', name: 'Eventos', type: 'egreso', active: false },
];

export function findCategory(id: string): Category | undefined {
  return MOCK_CATEGORIES.find((category) => category.id === id);
}

const categoryName = (id: string) => findCategory(id)?.name ?? 'Sin categoría';

const seed = (
  id: string,
  type: MovementType,
  categoryId: string,
  amount: number,
  date: string,
  description: string,
): Movement => ({
  id,
  type,
  categoryId,
  categoryName: categoryName(categoryId),
  amount,
  date,
  description,
  createdBy: { id: 'u2', name: 'David Muñoz' },
  createdAt: `${date}T14:00:00.000Z`,
});

// Movimientos de ejemplo de varios meses para que los reportes (RF04) tengan datos que filtrar.
const seedMovements: Movement[] = [
  seed('m1', 'ingreso', 'ing-admin', 8_250_000, '2026-07-05', 'Recaudo cuotas de administración julio'),
  seed('m2', 'egreso', 'egr-servicios', 980_000, '2026-07-18', 'Energía y acueducto de zonas comunes'),
  seed('m3', 'egreso', 'egr-nomina', 3_200_000, '2026-07-30', 'Nómina de julio del personal de aseo y portería'),
  seed('m4', 'ingreso', 'ing-admin', 8_300_000, '2026-08-05', 'Recaudo cuotas de administración agosto'),
  seed('m5', 'ingreso', 'ing-zonas', 450_000, '2026-08-16', 'Alquiler del salón social'),
  seed('m6', 'egreso', 'egr-nomina', 3_200_000, '2026-08-30', 'Nómina de agosto del personal de aseo y portería'),
  seed('m7', 'egreso', 'egr-vigilancia', 2_100_000, '2026-08-31', 'Servicio de vigilancia de agosto'),
  seed('m8', 'ingreso', 'ing-admin', 8_400_000, '2026-09-05', 'Recaudo cuotas de administración septiembre'),
  seed('m9', 'egreso', 'egr-mantenimiento', 1_250_000, '2026-09-12', 'Mantenimiento preventivo del ascensor'),
  seed('m10', 'ingreso', 'ing-multas', 180_000, '2026-09-20', 'Intereses de mora de septiembre'),
  seed('m11', 'egreso', 'egr-nomina', 3_200_000, '2026-09-30', 'Nómina de septiembre del personal de aseo y portería'),
  seed('m12', 'ingreso', 'ing-admin', 2_150_000, '2026-10-01', 'Recaudo parcial cuotas de administración octubre'),
  seed('m13', 'egreso', 'egr-aseo', 320_000, '2026-10-01', 'Insumos de limpieza para zonas comunes'),
];

let movements: Movement[] = [];
let nextId = 1;

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockFinanceState() {
  movements = seedMovements.map((movement) => ({ ...movement }));
  nextId = seedMovements.length + 1;
}
resetMockFinanceState();

async function listCategories(type: MovementType): Promise<Category[]> {
  await simulateNetwork(0.5);
  return MOCK_CATEGORIES.filter((category) => category.active && category.type === type).sort(byName);
}

async function listReportCategories(): Promise<Category[]> {
  await simulateNetwork(0.5);
  return [...MOCK_CATEGORIES].sort(byTypeAndName);
}

async function listMovements(): Promise<Movement[]> {
  await simulateNetwork(0.5);
  return [...movements].sort(newestFirst);
}

async function createMovement(input: MovementInput, user: User): Promise<Movement> {
  await simulateNetwork();
  if (!MOVEMENT_ROLES.includes(user.role)) {
    throw new FinanceError('forbidden');
  }
  const errors = validateMovement(input, undefined, MOCK_CATEGORIES);
  if (Object.keys(errors).length > 0) {
    throw new FinanceError('validation', errors);
  }
  const movement: Movement = {
    ...input,
    description: input.description.trim(),
    attachment: input.attachment ?? null,
    id: `m${nextId++}`,
    categoryName: categoryName(input.categoryId),
    createdBy: { id: user.id, name: user.name },
    createdAt: new Date().toISOString(),
  };
  movements = [...movements, movement];
  return movement;
}

async function getFinancialReport(filters: ReportFilters, user: User): Promise<FinancialReport> {
  await simulateNetwork();
  if (!REPORT_ROLES.includes(user.role)) {
    throw new FinanceError('forbidden');
  }
  const errors = validateReportFilters(filters);
  if (Object.keys(errors).length > 0) {
    throw new FinanceError<ReportErrors>('validation', errors);
  }
  const items = movements
    .filter((item) => item.date >= filters.from && item.date <= filters.to)
    .filter((item) => filters.categoryId === ALL_CATEGORIES || item.categoryId === filters.categoryId)
    .sort(oldestFirst);

  return {
    filters,
    categoryName: filters.categoryId === ALL_CATEGORIES ? 'Todas' : categoryName(filters.categoryId),
    movements: items,
    totals: computeTotals(items),
    generatedAt: new Date().toISOString(),
    generatedBy: { id: user.id, name: user.name },
  };
}

export const financeBackend = {
  listCategories,
  listReportCategories,
  listMovements,
  createMovement,
  getFinancialReport,
} satisfies FinanceBackend;
