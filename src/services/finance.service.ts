// Punto de entrada de finanzas (RF03 y RF04): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa finance.supabase.ts; si no, el servicio simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { MOCK_CATEGORIES, financeBackend as mockBackend } from '@/services/finance.mock';
import { financeBackend as supabaseBackend } from '@/services/finance.supabase';
import type { Category, FinanceBackend, MovementErrors, MovementInput } from '@/services/finance.types';
import { validateMovement as validateMovementWith } from '@/services/finance.validation';
import { todayISO } from '@/utils/date';

export {
  ALL_CATEGORIES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  FinanceError,
  REPORT_MAX_MONTHS,
  type Attachment,
  type Category,
  type FinancialReport,
  type Movement,
  type MovementErrors,
  type MovementField,
  type MovementInput,
  type MovementType,
  type ReportErrors,
  type ReportFilters,
  type ReportTotals,
} from '@/services/finance.types';
export { computeTotals, isAllowedAttachment, validateReportFilters } from '@/services/finance.validation';
// Solo para las pruebas y el modo simulado.
export { findCategory, resetMockFinanceState } from '@/services/finance.mock';

const backend: FinanceBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

/**
 * Reglas de RF03. `categories` es el catálogo cargado en la pantalla; por defecto, en modo simulado
 * se usa el catálogo de prueba y con Supabase la categoría la termina de validar el servidor.
 */
export function validateMovement(
  input: Partial<MovementInput>,
  today = todayISO(),
  categories: Category[] | null = isSupabaseEnabled ? null : MOCK_CATEGORIES,
): MovementErrors {
  return validateMovementWith(input, today, categories);
}

export const listCategories: FinanceBackend['listCategories'] = (...args) => backend.listCategories(...args);
export const listReportCategories: FinanceBackend['listReportCategories'] = (...args) =>
  backend.listReportCategories(...args);
export const listMovements: FinanceBackend['listMovements'] = (...args) => backend.listMovements(...args);
export const createMovement: FinanceBackend['createMovement'] = (...args) => backend.createMovement(...args);
export const getFinancialReport: FinanceBackend['getFinancialReport'] = (...args) =>
  backend.getFinancialReport(...args);
