// Tipos y contrato común de finanzas (RF03 y RF04). Lo cumplen el servicio simulado (finance.mock.ts)
// y el de Supabase (finance.supabase.ts); las pantallas solo conocen este contrato vía finance.service.ts.

import type { User } from '@/services/auth.types';

export type MovementType = 'ingreso' | 'egreso';

export type Category = {
  id: string;
  name: string;
  type: MovementType;
  active: boolean;
};

export type Attachment = {
  /** Archivo local elegido en el celular o en web (vacío en los soportes ya guardados). */
  uri: string;
  name: string;
  mimeType: string;
  /** Tamaño en bytes; algunos selectores no lo informan. */
  size?: number;
  /** Ruta del soporte en Supabase Storage, una vez guardado el movimiento. */
  storagePath?: string;
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
  /** Nombre de la categoría al consultar (puede estar inactiva en el catálogo). */
  categoryName: string;
  /** Auditoría: quién y cuándo registró el movimiento. */
  createdBy: { id: string; name: string };
  createdAt: string;
};

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 250;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** RF03: solo el administrador registra movimientos. */
export const MOVEMENT_ROLES: User['role'][] = ['administrador'];
/** RF04: la junta directiva consulta los reportes en solo lectura. */
export const REPORT_ROLES: User['role'][] = ['administrador', 'junta_directiva'];

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
  /** Nombre de la categoría filtrada («Todas» si no se filtra). */
  categoryName: string;
  /** Movimientos del periodo en orden cronológico. */
  movements: Movement[];
  totals: ReportTotals;
  generatedAt: string;
  generatedBy: { id: string; name: string };
};

/** Funciones que debe ofrecer cada implementación de finanzas. */
export type FinanceBackend = {
  /** RF03: categorías activas del tipo indicado, en orden alfabético. */
  listCategories(type: MovementType): Promise<Category[]>;
  /** RF04: todas las categorías (también las inactivas, que pueden tener movimientos antiguos). */
  listReportCategories(): Promise<Category[]>;
  /** RF03: movimientos del conjunto, del más reciente al más antiguo. */
  listMovements(): Promise<Movement[]>;
  /** RF03: registra un ingreso o egreso. Falla con FinanceError (forbidden o validation). */
  createMovement(input: MovementInput, user: User): Promise<Movement>;
  /** RF04: reporte del periodo y la categoría elegidos. Falla con FinanceError. */
  getFinancialReport(filters: ReportFilters, user: User): Promise<FinancialReport>;
};

/** Del más reciente al más antiguo (por fecha y luego por registro). */
export const newestFirst = (a: Movement, b: Movement) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

/** Orden cronológico (por fecha y luego por registro). */
export const oldestFirst = (a: Movement, b: Movement) =>
  a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

/** Orden de las categorías: alfabético en español. */
export const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'es');

/** Orden del filtro de reportes: primero egresos y luego ingresos, cada grupo alfabético. */
export const byTypeAndName = (a: Category, b: Category) => a.type.localeCompare(b.type, 'es') || byName(a, b);
