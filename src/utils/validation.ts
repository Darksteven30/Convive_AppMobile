// Reglas de validación compartidas por los formularios (documento de requisitos, RF01, RF16 y RF17).

export const EMAIL_MAX_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 50;
export const RESET_CODE_LENGTH = 6;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** El correo se guarda en minúsculas y sin espacios. */
export function normalizeEmail(email: string): string {
  return email.replace(/\s/g, '').toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(normalized);
}

export const passwordRules = [
  { label: 'Mínimo 8 caracteres', test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { label: 'Una mayúscula', test: (value: string) => /[A-ZÁÉÍÓÚÑ]/.test(value) },
  { label: 'Un número o símbolo', test: (value: string) => /[\d\W_]/.test(value) },
];

export function meetsPasswordRules(password: string): boolean {
  return password.length <= PASSWORD_MAX_LENGTH && passwordRules.every((rule) => rule.test(password));
}

/** RF16: celular colombiano de 10 dígitos que empieza por 3. */
export const PHONE_LENGTH = 10;

/** Deja solo los dígitos: «311 123 4567» → «3111234567». */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isValidPhone(phone: string): boolean {
  return /^3\d{9}$/.test(normalizePhone(phone));
}

/** Formato de lectura: «3111234567» → «311 123 4567». */
export function formatPhone(phone: string): string {
  const digits = normalizePhone(phone);
  return digits.length === PHONE_LENGTH ? `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}` : phone;
}
