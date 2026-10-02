// Servicio de autenticación simulado (mock). Se reemplazará por llamadas al backend
// manteniendo la misma interfaz. Las reglas que aquí se simulan (bloqueo por intentos,
// códigos de recuperación) en producción deben vivir en el servidor.

import { simulateNetwork } from '@/services/mockNetwork';
import { normalizeEmail } from '@/utils/validation';

export type Role = 'administrador' | 'junta_directiva' | 'residente' | 'vigilancia';

export type User = {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  house: string;
  address: string;
  role: Role;
};

/** Estado de un correo: con contraseña, pre-registrado por la administración sin contraseña, o inexistente. */
export type EmailStatus = 'registered' | 'pending' | 'not_found';

type MockAccount = User & { password: string | null };

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
/** En el mock el código de recuperación es fijo; el backend lo generará y enviará por correo. */
export const MOCK_RESET_CODE = '123456';

const initialAccounts: MockAccount[] = [
  {
    id: 'u1',
    name: 'Monica Galvis',
    initials: 'MG',
    email: 'monica@gmail.com',
    phone: '311 123 4567',
    house: '56',
    address: 'Casa # 56 Cali - Valle',
    role: 'residente',
    password: 'Residente123',
  },
  {
    id: 'u2',
    name: 'David Muñoz',
    initials: 'DM',
    email: 'admin@convive.com',
    phone: '300 765 4321',
    house: 'Administración',
    address: 'Oficina de administración',
    role: 'administrador',
    password: 'Admin123',
  },
  {
    id: 'u3',
    name: 'Carlos Rojas',
    initials: 'CR',
    email: 'junta@convive.com',
    phone: '315 222 3344',
    house: '12',
    address: 'Casa # 12 Cali - Valle',
    role: 'junta_directiva',
    password: 'Junta123',
  },
  {
    id: 'u4',
    name: 'Jorge Pérez',
    initials: 'JP',
    email: 'vigilancia@convive.com',
    phone: '318 555 6677',
    house: 'Portería',
    address: 'Portería principal',
    role: 'vigilancia',
    password: 'Vigilancia123',
  },
  {
    // Pre-registrado por la administración: aún no ha creado su contraseña.
    id: 'u5',
    name: 'Laura Gómez',
    initials: 'LG',
    email: 'nuevo@convive.com',
    phone: '312 987 6543',
    house: '78',
    address: 'Casa # 78 Cali - Valle',
    role: 'residente',
    password: null,
  },
];

let accounts: MockAccount[] = [];
let failedAttempts = new Map<string, { count: number; lockedUntil: number | null }>();
let resetCodes = new Map<string, { code: string; expiresAt: number }>();

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockAuthState() {
  accounts = initialAccounts.map((account) => ({ ...account }));
  failedAttempts = new Map();
  resetCodes = new Map();
}
resetMockAuthState();

export type AuthErrorCode =
  | 'not_found'
  | 'invalid_credentials'
  | 'locked'
  | 'password_already_set'
  | 'invalid_code';

export class AuthError extends Error {
  constructor(
    public readonly code: AuthErrorCode,
    /** Intentos que quedan antes del bloqueo (solo con invalid_credentials). */
    public readonly remainingAttempts?: number,
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

const findAccount = (email: string) => accounts.find((item) => item.email === normalizeEmail(email));

const toUser = ({ password: _password, ...user }: MockAccount): User => user;

function isLocked(email: string) {
  const entry = failedAttempts.get(email);
  if (!entry?.lockedUntil) return false;
  if (Date.now() >= entry.lockedUntil) {
    failedAttempts.delete(email);
    return false;
  }
  return true;
}

/** Paso 1 del inicio de sesión: indica si el correo tiene cuenta, está pre-registrado o no existe. */
export async function lookupEmail(email: string): Promise<EmailStatus> {
  await simulateNetwork();
  const account = findAccount(email);
  if (!account) return 'not_found';
  return account.password === null ? 'pending' : 'registered';
}

/** Paso 2: verifica la contraseña. Tras 5 intentos fallidos bloquea la cuenta 15 minutos. */
export async function signIn(email: string, password: string): Promise<User> {
  await simulateNetwork();
  const key = normalizeEmail(email);
  if (isLocked(key)) {
    throw new AuthError('locked');
  }

  const account = findAccount(key);
  if (account?.password && account.password === password) {
    failedAttempts.delete(key);
    return toUser(account);
  }

  const count = (failedAttempts.get(key)?.count ?? 0) + 1;
  if (count >= MAX_FAILED_ATTEMPTS) {
    failedAttempts.set(key, { count, lockedUntil: Date.now() + LOCK_DURATION_MS });
    throw new AuthError('locked');
  }
  failedAttempts.set(key, { count, lockedUntil: null });
  throw new AuthError('invalid_credentials', MAX_FAILED_ATTEMPTS - count);
}

/** Primera contraseña de una cuenta pre-registrada. Deja la sesión iniciada. */
export async function createPassword(email: string, password: string): Promise<User> {
  await simulateNetwork();
  const account = findAccount(email);
  if (!account) throw new AuthError('not_found');
  if (account.password !== null) throw new AuthError('password_already_set');
  account.password = password;
  return toUser(account);
}

/** Envía (simula enviar) al correo un código de 6 dígitos válido por 10 minutos. */
export async function requestPasswordReset(email: string): Promise<void> {
  await simulateNetwork();
  const account = findAccount(email);
  if (!account) throw new AuthError('not_found');
  resetCodes.set(account.email, { code: MOCK_RESET_CODE, expiresAt: Date.now() + RESET_CODE_TTL_MS });
}

/** Define una nueva contraseña con el código recibido. También desbloquea la cuenta. */
export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  await simulateNetwork();
  const key = normalizeEmail(email);
  const entry = resetCodes.get(key);
  const account = findAccount(key);
  if (!account || !entry || entry.code !== code || Date.now() > entry.expiresAt) {
    throw new AuthError('invalid_code');
  }
  account.password = newPassword;
  resetCodes.delete(key);
  failedAttempts.delete(key);
}

export async function signOut(): Promise<void> {
  await simulateNetwork(0.5);
}
