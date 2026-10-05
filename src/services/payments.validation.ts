// Reglas de RF11 para el concepto y el valor a pagar. Las usan la pantalla de Selección y el
// servicio simulado (que replica lo que valida el servidor en iniciar_pago()).

import { MSG } from '@/constants/messages';
import { toCents, type PaymentConcept } from '@/services/payments.types';
import { formatAmount } from '@/utils/money';

export const DESCRIPTION_MIN = 5;
export const DESCRIPTION_MAX = 100;

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
 */
export function validatePaymentSelection(input: PaymentSelection, concepts: PaymentConcept[]): SelectionErrors {
  const concept = concepts.find((item) => item.id === input.conceptId);
  if (!concept) {
    return { concept: MSG.RF11.conceptRequired };
  }

  const errors: SelectionErrors = {};
  if (input.amount == null || !(input.amount > 0)) {
    errors.amount = MSG.RF11.amountInvalid;
  } else if (concept.balance > 0 && toCents(input.amount) > toCents(concept.balance)) {
    errors.amount = MSG.RF11.amountAboveBalance(formatAmount(concept.balance));
  }
  const description = input.description.trim();
  if (concept.requiresDescription && (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX)) {
    errors.description = MSG.RF11.descriptionLength;
  }
  return errors;
}
