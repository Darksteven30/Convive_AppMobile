// Servicio de finanzas simulado (mock) para RF03 y RF04. Las validaciones replican las que hará el
// servidor: la app valida para guiar al usuario, pero el backend nunca debe confiar en ella.

import { MSG } from '@/constants/messages';
import type { Role, User } from '@/services/auth.service';
import { simulateNetwork } from '@/services/mockNetwork';
import { addMonthsISO, isFutureDate, todayISO } from '@/utils/date';
import { MAX_AMOUNT } from '@/utils/money';

export type MovementType = 'ingreso' | 'egreso';

export type Category = {
  id: string;
  name: string;
  type: MovementType;
  active: boolean;
};

export type Attachment = {
  uri: string;
  name: string;
  mimeType: string;
  /** Tamaño en bytes; algunos selectores no lo informan. */
  size?: number;
};

export type MovementInput = {
  type: MovementType;
  categoryId: string;
  amount: number;
  /** Fecha del movimiento «aaaa-mm-dd». */
  date: string;
  description: string;
  attachment?: Attachment | null;
};

export type Movement = MovementInput & {
  id: string;
  /** Auditoría: quién y cuándo registró el movimiento. */
  createdBy: { id: string; name: string };
  createdAt: string;
};

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 250;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const ALLOWED_ROLES: Role[] = ['administrador'];
/** RF04: la junta directiva consulta los reportes en solo lectura. */
const REPORT_ROLES: Role[] = ['administrador', 'junta_directiva'];

const categories: Category[] = [
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

export type MovementField = 'categoryId' | 'amount' | 'date' | 'description' | 'attachment';
export type MovementErrors = Partial<Record<MovementField, string>>;

/** Error del servicio; fieldErrors trae un mensaje por campo inválido (de un movimiento o de un reporte). */
export class FinanceError<E extends object = MovementErrors> extends Error {
  constructor(
    public readonly code: 'forbidden' | 'validation',
    public readonly fieldErrors: E = {} as E,
  ) {
    super(code);
    this.name = 'FinanceError';
  }
}

export function findCategory(id: string): Category | undefined {
  return categories.find((category) => category.id === id);
}

export function isAllowedAttachment(attachment: Pick<Attachment, 'mimeType' | 'size'>): boolean {
  const typeOk = ATTACHMENT_MIME_TYPES.includes(attachment.mimeType.toLowerCase());
  const sizeOk = attachment.size === undefined || attachment.size <= ATTACHMENT_MAX_BYTES;
  return typeOk && sizeOk;
}

/**
 * Reglas de RF03 (matriz 7.1 y especificación 7.2). Devuelve un mensaje por campo inválido;
 * la usan tanto el formulario como el servicio.
 */
export function validateMovement(input: Partial<MovementInput>, today = todayISO()): MovementErrors {
  const errors: MovementErrors = {};
  const category = input.categoryId ? findCategory(input.categoryId) : undefined;

  if (!category || !category.active || category.type !== input.type) {
    errors.categoryId = MSG.RF03.categoryRequired;
  }
  if (input.amount == null || !(input.amount > 0)) {
    errors.amount = MSG.RF03.amountInvalid;
  } else if (input.amount > MAX_AMOUNT) {
    errors.amount = MSG.RF03.amountTooHigh;
  }
  if (!input.date || isFutureDate(input.date, today)) {
    errors.date = MSG.RF03.futureDate;
  }
  const description = input.description?.trim() ?? '';
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    errors.description = MSG.RF03.descriptionShort;
  }
  if (input.attachment && !isAllowedAttachment(input.attachment)) {
    errors.attachment = MSG.RF03.invalidFile;
  }
  return errors;
}

/** Categorías activas del tipo indicado, en orden alfabético. */
export async function listCategories(type: MovementType): Promise<Category[]> {
  await simulateNetwork(0.5);
  return categories
    .filter((category) => category.active && category.type === type)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** Movimientos del más reciente al más antiguo (por fecha y luego por registro). */
export async function listMovements(): Promise<Movement[]> {
  await simulateNetwork(0.5);
  return [...movements].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** Registra un ingreso o egreso. Solo el administrador puede hacerlo (MSG-RF03-07). */
export async function createMovement(input: MovementInput, user: User): Promise<Movement> {
  await simulateNetwork();
  if (!ALLOWED_ROLES.includes(user.role)) {
    throw new FinanceError('forbidden');
  }
  const errors = validateMovement(input);
  if (Object.keys(errors).length > 0) {
    throw new FinanceError('validation', errors);
  }
  const movement: Movement = {
    ...input,
    description: input.description.trim(),
    attachment: input.attachment ?? null,
    id: `m${nextId++}`,
    createdBy: { id: user.id, name: user.name },
    createdAt: new Date().toISOString(),
  };
  movements = [...movements, movement];
  return movement;
}

// ---------------------------------------------------------------------------------------------
// RF04 · Reportes financieros filtrables
// ---------------------------------------------------------------------------------------------

/** Valor del filtro de categoría que incluye todas las categorías. */
export const ALL_CATEGORIES = 'todas';
export const REPORT_MAX_MONTHS = 12;

export type ReportFilters = {
  /** Fecha inicial «aaaa-mm-dd». */
  from: string;
  /** Fecha final «aaaa-mm-dd». */
  to: string;
  /** ID de categoría o ALL_CATEGORIES. */
  categoryId: string;
};

export type ReportErrors = Partial<Record<'from' | 'to', string>>;

export type ReportTotals = { income: number; expenses: number; balance: number };

export type FinancialReport = {
  filters: ReportFilters;
  /** Movimientos del periodo en orden cronológico. */
  movements: Movement[];
  totals: ReportTotals;
  generatedAt: string;
  generatedBy: { id: string; name: string };
};

/** Reglas de la matriz 7.1 y la especificación 7.2 de RF04 para el rango de fechas. */
export function validateReportFilters(filters: ReportFilters, today = todayISO()): ReportErrors {
  const errors: ReportErrors = {};
  if (filters.from > filters.to) {
    errors.from = MSG.RF04.startAfterEnd;
  }
  if (isFutureDate(filters.to, today)) {
    errors.to = MSG.RF04.endAfterToday;
  } else if (filters.to > addMonthsISO(filters.from, REPORT_MAX_MONTHS)) {
    errors.to = MSG.RF04.rangeTooLong;
  }
  return errors;
}

/** Suma ingresos y egresos; el saldo del periodo es la diferencia. */
export function computeTotals(items: Movement[]): ReportTotals {
  const income = items.filter((item) => item.type === 'ingreso').reduce((sum, item) => sum + item.amount, 0);
  const expenses = items.filter((item) => item.type === 'egreso').reduce((sum, item) => sum + item.amount, 0);
  return { income, expenses, balance: income - expenses };
}

/** Todas las categorías (también las inactivas, que pueden tener movimientos antiguos), por tipo y nombre. */
export async function listReportCategories(): Promise<Category[]> {
  await simulateNetwork(0.5);
  return [...categories].sort(
    (a, b) => a.type.localeCompare(b.type, 'es') || a.name.localeCompare(b.name, 'es'),
  );
}

/** Genera el reporte del periodo y la categoría elegidos. Solo administrador y junta directiva. */
export async function getFinancialReport(filters: ReportFilters, user: User): Promise<FinancialReport> {
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
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  return {
    filters,
    movements: items,
    totals: computeTotals(items),
    generatedAt: new Date().toISOString(),
    generatedBy: { id: user.id, name: user.name },
  };
}
