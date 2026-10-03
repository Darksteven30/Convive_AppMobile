// Punto de entrada de los pagos: las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa payments.supabase.ts; si no, el servicio simulado.

import { MSG } from '@/constants/messages';
import { isSupabaseEnabled } from '@/lib/supabase';
import { paymentsBackend as mockBackend } from '@/services/payments.mock';
import { paymentsBackend as supabaseBackend } from '@/services/payments.supabase';
import { toCents, type PaymentConcept, type PaymentsBackend } from '@/services/payments.types';
import { formatAmount } from '@/utils/money';

export { toCents, type AccountStatus, type PaymentConcept } from '@/services/payments.types';
// Solo para las pruebas y el modo simulado.
export { resetMockPaymentsState, setMockBalance } from '@/services/payments.mock';

const backend: PaymentsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const getAccountStatus: PaymentsBackend['getAccountStatus'] = (...args) => backend.getAccountStatus(...args);

// ---------------------------------------------------------------------------------------------
// RF11 · Validaciones de la selección
// ---------------------------------------------------------------------------------------------

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
