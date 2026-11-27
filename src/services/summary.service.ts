// Punto de entrada del resumen de General (RF14): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa summary.supabase.ts; si no, el servicio
// simulado, que calcula los mismos totales con los datos simulados de finanzas, PQRS y reservas.

import { isSupabaseEnabled } from '@/lib/supabase';
import { summaryBackend as mockBackend } from '@/services/summary.mock';
import { summaryBackend as supabaseBackend } from '@/services/summary.supabase';
import type { SummaryBackend } from '@/services/summary.types';

export {
  INITIAL_BALANCE_MAX,
  SUMMARY_MAX_MONTHS,
  SUMMARY_PERIODS,
  SummaryError,
  type FinancialSummary,
  type MonthTotals,
  type SummaryPeriod,
  type SummaryRange,
  type SummaryRangeErrors,
} from '@/services/summary.types';
export { isValidInitialBalance, rangeForPeriod, validateSummaryRange } from '@/services/summary.validation';
// Solo para las pruebas y el modo simulado.
export { resetMockSummaryState } from '@/services/summary.mock';

const backend: SummaryBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const getSummary: SummaryBackend['getSummary'] = (...args) => backend.getSummary(...args);
export const getInitialBalance: SummaryBackend['getInitialBalance'] = (...args) => backend.getInitialBalance(...args);
export const setInitialBalance: SummaryBackend['setInitialBalance'] = (...args) => backend.setInitialBalance(...args);
