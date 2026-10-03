// Tipos y contrato común de la autenticación. Lo cumplen el servicio simulado (auth.mock.ts) y el
// de Supabase (auth.supabase.ts); las pantallas solo conocen este contrato vía auth.service.ts.

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

export type AuthErrorCode =
  | 'not_found'
  | 'invalid_credentials'
  | 'locked'
  | 'password_already_set'
  | 'invalid_code'
  // RF17: contraseña actual incorrecta, nueva igual a la actual o sin las reglas de seguridad.
  | 'wrong_password'
  | 'same_password'
  | 'weak_password'
  // RF16: teléfono que no es un celular de 10 dígitos que empiece por 3.
  | 'invalid_phone'
  // Supabase: el proyecto exige confirmar el correo antes de iniciar sesión.
  | 'confirmation_required';

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

/** Funciones que debe ofrecer cada implementación de la autenticación. */
export type AuthBackend = {
  /** Paso 1 del inicio de sesión: indica si el correo tiene cuenta, está pre-registrado o no existe. */
  lookupEmail(email: string): Promise<EmailStatus>;
  /** Paso 2: verifica la contraseña. Tras 5 intentos fallidos bloquea la cuenta 15 minutos. */
  signIn(email: string, password: string): Promise<User>;
  /** Primera contraseña de una cuenta pre-registrada. Deja la sesión iniciada. */
  createPassword(email: string, password: string): Promise<User>;
  /** Envía al correo un código de 6 dígitos para definir una nueva contraseña. */
  requestPasswordReset(email: string): Promise<void>;
  /** Define una nueva contraseña con el código recibido. También desbloquea la cuenta. */
  resetPassword(email: string, code: string, newPassword: string): Promise<void>;
  /** RF17: cambia la contraseña verificando la actual. */
  changePassword(email: string, currentPassword: string, newPassword: string): Promise<void>;
  /** RF16: el usuario solo puede cambiar su teléfono. */
  updatePhone(email: string, phone: string): Promise<User>;
  signOut(): Promise<void>;
  /** Usuario de la sesión guardada en el dispositivo (al abrir la app), o null. */
  getCurrentUser(): Promise<User | null>;
  /** Avisa cuando la sesión termina sin que el usuario la cierre (p. ej. venció). Devuelve cómo cancelar. */
  subscribeToSessionEnd(listener: () => void): () => void;
};

/** «Monica Galvis» → «MG». */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}
