// Reglas de RF11 para el concepto y el valor a pagar. Las usan la pantalla de Selección y el
// servicio simulado (que replica lo que valida el servidor en iniciar_pago()).
// También las del periodo del historial de pagos (RF02).

import { MSG } from '@/constants/messages';
import { toCents, type PaymentConcept, type PaymentHistoryFilters } from '@/services/payments.types';
import { addMonthsISO, todayISO } from '@/utils/date';
import { formatAmount } from '@/utils/money';

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 100;
/** Wompi rechaza transacciones de menos de $ 1.500 COP; iniciar_pago() aplica la misma regla. */
export const WOMPI_MIN_AMOUNT = 1500;

export type PaymentSelection = {
  conceptId: string | null;
  /** Valor a pagar, o null si el campo está vacío. */
  amount: number | null;
  /** Solo se valida en los conceptos que la piden («Otros conceptos»). */
  description: string;
};

export type SelectionErrors = Partial<Record<'concept' | 'amount' | 'description', string>>;

/**
 * Reglas de RF11: concepto obligatorio y del catálogo; valor > 0 y, si el concepto tiene saldo
 * pendiente, ≤ saldo. Un concepto sin saldo acepta cualquier valor > 0 (p. ej. una cuota extra).
 * En todos los casos, al menos WOMPI_MIN_AMOUNT: la pasarela no acepta menos.
 */
export function validatePaymentSelection(input: PaymentSelection, concepts: PaymentConcept[]): SelectionErrors {
  const concept = concepts.find((item) => item.id === input.conceptId);
  if (!concept) {
    return { concept: MSG.RF11.conceptRequired };
  }

  const errors: SelectionErrors = {};
  if (input.amount == null || !(input.amount > 0)) {
    errors.amount = MSG.RF11.amountInvalid;
  } else if (toCents(input.amount) < toCents(WOMPI_MIN_AMOUNT)) {
    errors.amount = MSG.RF11.amountBelowMinimum(formatAmount(WOMPI_MIN_AMOUNT));
  } else if (concept.balance > 0 && toCents(input.amount) > toCents(concept.balance)) {
    errors.amount = MSG.RF11.amountAboveBalance(formatAmount(concept.balance));
  }
  const description = input.description.trim();
  if (concept.requiresDescription && (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX)) {
    errors.description = MSG.RF11.descriptionLength;
  }
  return errors;
}

/** RF02: el historial muestra 12 pagos por página y «Ver más» agrega los siguientes. */
export const HISTORY_PAGE_SIZE = 12;

/** RF02: periodo por defecto del historial, los últimos 12 meses hasta hoy. */
export function defaultHistoryFilters(today = todayISO()): PaymentHistoryFilters {
  return { from: addMonthsISO(today, -12), to: today };
}

export type HistoryFilterErrors = Partial<Record<'from', string>>;

/** RF02: fecha inicial ≤ fecha final (MSG-RF02-02). */
export function validateHistoryFilters(filters: PaymentHistoryFilters): HistoryFilterErrors {
  return filters.from > filters.to ? { from: MSG.RF02.startAfterEnd } : {};
}
