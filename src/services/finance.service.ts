// Servicio de finanzas simulado (mock) para RF03. Las validaciones replican las que hará el
// servidor: la app valida para guiar al usuario, pero el backend nunca debe confiar en ella.

import { MSG } from '@/constants/messages';
import type { Role, User } from '@/services/auth.service';
import { simulateNetwork } from '@/services/mockNetwork';
import { isFutureDate, todayISO } from '@/utils/date';
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

const seedMovements: Movement[] = [
  {
    id: 'm1',
    type: 'ingreso',
    categoryId: 'ing-admin',
    amount: 8_400_000,
    date: '2026-09-05',
    description: 'Recaudo cuotas de administración septiembre',
    createdBy: { id: 'u2', name: 'David Muñoz' },
    createdAt: '2026-09-05T15:20:00.000Z',
  },
  {
    id: 'm2',
    type: 'egreso',
    categoryId: 'egr-mantenimiento',
    amount: 1_250_000,
    date: '2026-09-12',
    description: 'Mantenimiento preventivo del ascensor',
    createdBy: { id: 'u2', name: 'David Muñoz' },
    createdAt: '2026-09-12T19:05:00.000Z',
  },
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

export class FinanceError extends Error {
  constructor(
    public readonly code: 'forbidden' | 'validation',
    public readonly fieldErrors: MovementErrors = {},
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
