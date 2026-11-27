// Reglas del resumen de General (RF14) que comparten la pantalla y los servicios. El servidor
// (resumen_general() en 20261126000000_resumen_general.sql) repite la validación del rango.

import { MSG } from '@/constants/messages';
import {
  INITIAL_BALANCE_MAX,
  SUMMARY_MAX_MONTHS,
  type SummaryPeriod,
  type SummaryRange,
  type SummaryRangeErrors,
} from '@/services/summary.types';
import { addDaysISO, addMonthsISO, isFutureDate, startOfMonthISO, todayISO } from '@/utils/date';

/**
 * Rango de cada opción del selector, hasta hoy. «Últimos 3/6 meses» cuentan el mes actual: en
 * noviembre, «Últimos 3 meses» va del 1 de septiembre a hoy. «Personalizado» lo eligen las fechas.
 */
export function rangeForPeriod(period: Exclude<SummaryPeriod, 'personalizado'>, today = todayISO()): SummaryRange {
  const thisMonth = startOfMonthISO(today);
  switch (period) {
    case 'este_mes':
      return { from: thisMonth, to: today };
    case 'mes_anterior':
      return { from: addMonthsISO(thisMonth, -1), to: addDaysISO(thisMonth, -1) };
    case 'ultimos_3':
      return { from: addMonthsISO(thisMonth, -2), to: today };
    case 'ultimos_6':
      return { from: addMonthsISO(thisMonth, -5), to: today };
    case 'este_ano':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** MSG-RF14-02 y, como en RF04, fecha final no posterior a hoy y rango de máximo 12 meses. */
export function validateSummaryRange(range: SummaryRange, today = todayISO()): SummaryRangeErrors {
  const errors: SummaryRangeErrors = {};
  if (range.from > range.to) {
    errors.from = MSG.RF14.startAfterEnd;
  }
  if (isFutureDate(range.to, today)) {
    errors.to = MSG.RF14.endAfterToday;
  } else if (range.to > addMonthsISO(range.from, SUMMARY_MAX_MONTHS)) {
    errors.to = MSG.RF14.rangeTooLong;
  }
  return errors;
}

/** Saldo inicial: de $ 0 a $ 999.999.999,99, con máximo 2 decimales. */
export function isValidInitialBalance(amount: number | null): amount is number {
  return (
    amount !== null &&
    Number.isFinite(amount) &&
    amount >= 0 &&
    amount <= INITIAL_BALANCE_MAX &&
    Math.round(amount * 100) === amount * 100
  );
}
