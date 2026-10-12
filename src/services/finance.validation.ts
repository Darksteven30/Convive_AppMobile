// Reglas de RF03 y RF04 (matriz 7.1 y especificación 7.2) compartidas por las pantallas y los dos
// servicios. La app valida para guiar al usuario, pero el servidor nunca confía en ella: en Supabase
// las mismas reglas se repiten en registrar_movimiento() y movimientos_financieros().

import { MSG } from '@/constants/messages';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MIME_TYPES,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  REPORT_MAX_MONTHS,
  type Attachment,
  type Category,
  type Movement,
  type MovementErrors,
  type MovementInput,
  type ReportErrors,
  type ReportFilters,
  type ReportTotals,
} from '@/services/finance.types';
import { addMonthsISO, isFutureDate, todayISO } from '@/utils/date';
import { MAX_AMOUNT } from '@/utils/money';

export function isAllowedAttachment(attachment: Pick<Attachment, 'mimeType' | 'size'>): boolean {
  const typeOk = ATTACHMENT_MIME_TYPES.includes(attachment.mimeType.toLowerCase());
  const sizeOk = attachment.size === undefined || attachment.size <= ATTACHMENT_MAX_BYTES;
  return typeOk && sizeOk;
}

/**
 * Reglas de RF03. Devuelve un mensaje por campo inválido.
 * `categories` es el catálogo con el que se valida la categoría (debe existir, estar activa y ser
 * del tipo elegido); con `null` solo se exige que haya una, y el servidor valida el resto.
 */
export function validateMovement(
  input: Partial<MovementInput>,
  today = todayISO(),
  categories: Category[] | null = null,
): MovementErrors {
  const errors: MovementErrors = {};

  if (!input.categoryId) {
    errors.categoryId = MSG.RF03.categoryRequired;
  } else if (categories) {
    const category = categories.find((item) => item.id === input.categoryId);
    if (!category || !category.active || category.type !== input.type) {
      errors.categoryId = MSG.RF03.categoryRequired;
    }
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
