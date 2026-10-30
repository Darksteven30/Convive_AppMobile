// Reglas de RF10 (matriz 7.1 y especificación 7.2) compartidas por la pantalla y los dos servicios.
// La app valida para guiar a la vigilancia, pero el servidor nunca confía en ella: en Supabase las
// mismas reglas se repiten en registrar_entrada_visitante().

import { MSG } from '@/constants/messages';
import { NAME_MAX, NAME_MIN, type DocumentType, type EntryInput, type VisitorErrors } from '@/services/visitors.types';

const NAME_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]+$/;
const NUMERIC_DOCUMENT = /^\d{5,12}$/;
const PASSPORT = /^[A-Z0-9]{5,15}$/;
/** Carro AAA123 o moto AAA12A. */
const PLATE_PATTERN = /^[A-Z]{3}(\d{3}|\d{2}[A-Z])$/;

/** Sin espacios al inicio ni al final y uno solo entre palabras: «  ana   pérez » → «ana pérez». */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Sin espacios ni guiones; el pasaporte en mayúsculas. */
export function normalizeDocument(number: string): string {
  return number.replace(/[\s.-]/g, '').toUpperCase();
}

/** Sin espacios ni guiones y en mayúsculas: «abc-12d» → «ABC12D». */
export function normalizePlate(plate: string): string {
  return plate.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidName(name: string): boolean {
  const value = normalizeName(name);
  return value.length >= NAME_MIN && value.length <= NAME_MAX && NAME_PATTERN.test(value);
}

/** CC, CE y TI: 5 a 12 dígitos; pasaporte: 5 a 15 letras o números. */
export function isValidDocument(type: DocumentType, number: string): boolean {
  const value = normalizeDocument(number);
  return type === 'PASAPORTE' ? PASSPORT.test(value) : NUMERIC_DOCUMENT.test(value);
}

export function isValidPlate(plate: string): boolean {
  return PLATE_PATTERN.test(normalizePlate(plate));
}

/** Reglas de RF10. Devuelve un mensaje por campo inválido. */
export function validateEntry(input: Partial<EntryInput>): VisitorErrors {
  const errors: VisitorErrors = {};

  if (!isValidName(input.name ?? '')) {
    errors.name = MSG.RF10.nameInvalid;
  }
  if (!input.documentType || !isValidDocument(input.documentType, input.documentNumber ?? '')) {
    errors.documentNumber = MSG.RF10.documentInvalid;
  }
  if (!input.unitId) {
    errors.unitId = MSG.RF10.unitRequired;
  }
  const plate = input.plate?.trim() ?? '';
  if (plate !== '' && !isValidPlate(plate)) {
    errors.plate = MSG.RF10.plateInvalid;
  }
  return errors;
}
