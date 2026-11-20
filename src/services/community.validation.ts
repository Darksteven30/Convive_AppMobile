// Reglas de RF20 compartidas por las pantallas y los dos servicios. La app valida para guiar a la
// administración, pero el servidor nunca confía en ella: en Supabase las mismas reglas se repiten en
// guardar_unidad(), validar_usuario(), preregistrar_usuario() y editar_usuario().

import { MSG } from '@/constants/messages';
import {
  PERSON_NAME_MAX,
  PERSON_NAME_MIN,
  ROLES_WITH_UNIT,
  UNIT_ADDRESS_MAX,
  UNIT_NAME_MAX,
  type PersonErrors,
  type PersonInput,
  type UnitErrors,
  type UnitInput,
} from '@/services/community.types';
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from '@/utils/validation';

/** Sin espacios al inicio ni al final y uno solo entre palabras. */
export const collapseSpaces = (text: string) => text.trim().replace(/\s+/g, ' ');

export function normalizeUnit(input: UnitInput): { name: string; address: string | null } {
  const address = collapseSpaces(input.address);
  return { name: collapseSpaces(input.name), address: address || null };
}

export function normalizePerson(input: PersonInput) {
  const phone = normalizePhone(input.phone);
  return {
    name: collapseSpaces(input.name),
    email: normalizeEmail(input.email),
    phone: phone || null,
    role: input.role,
    unitId: input.unitId,
  };
}

/** Reglas de la unidad: nombre de 1 a 40 caracteres y dirección opcional de hasta 120. */
export function validateUnit(input: Partial<UnitInput>): UnitErrors {
  const errors: UnitErrors = {};
  const name = collapseSpaces(input.name ?? '');
  if (name.length < 1 || name.length > UNIT_NAME_MAX) {
    errors.name = MSG.RF20.unitNameInvalid;
  }
  if (collapseSpaces(input.address ?? '').length > UNIT_ADDRESS_MAX) {
    errors.address = MSG.RF20.unitAddressInvalid;
  }
  return errors;
}

/** Reglas de la persona. La unidad es obligatoria para residentes y junta directiva. */
export function validatePerson(input: Partial<PersonInput>): PersonErrors {
  const errors: PersonErrors = {};
  const name = collapseSpaces(input.name ?? '');
  if (name.length < PERSON_NAME_MIN || name.length > PERSON_NAME_MAX) {
    errors.name = MSG.RF20.personNameInvalid;
  }
  if (!isValidEmail(input.email ?? '')) {
    errors.email = MSG.RF20.emailInvalid;
  }
  const phone = input.phone ?? '';
  if (phone.trim() !== '' && !isValidPhone(phone)) {
    errors.phone = MSG.RF16.phoneInvalid;
  }
  if (!input.role) {
    errors.role = MSG.RF20.roleRequired;
  }
  if (!input.unitId && input.role && ROLES_WITH_UNIT.includes(input.role)) {
    errors.unitId = MSG.RF20.unitRequired;
  }
  return errors;
}
