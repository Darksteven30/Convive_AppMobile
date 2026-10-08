// Punto de entrada de la autenticación: las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa auth.supabase.ts; si no, el servicio simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { authBackend as mockBackend } from '@/services/auth.mock';
import { authBackend as supabaseBackend } from '@/services/auth.supabase';
import type { AuthBackend } from '@/services/auth.types';

export { AuthError, type AuthErrorCode, type EmailStatus, type Role, type User } from '@/services/auth.types';
// Solo para las pruebas y el modo simulado.
export { MOCK_RESET_CODE, resetMockAuthState } from '@/services/auth.mock';

const backend: AuthBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

/** true si la sesión se guarda en el dispositivo y hay que restaurarla al abrir la app. */
export const restoresSession = isSupabaseEnabled;

export const lookupEmail: AuthBackend['lookupEmail'] = (...args) => backend.lookupEmail(...args);
export const signIn: AuthBackend['signIn'] = (...args) => backend.signIn(...args);
export const createPassword: AuthBackend['createPassword'] = (...args) => backend.createPassword(...args);
export const requestPasswordReset: AuthBackend['requestPasswordReset'] = (...args) => backend.requestPasswordReset(...args);
export const resetPassword: AuthBackend['resetPassword'] = (...args) => backend.resetPassword(...args);
export const changePassword: AuthBackend['changePassword'] = (...args) => backend.changePassword(...args);
export const updatePhone: AuthBackend['updatePhone'] = (...args) => backend.updatePhone(...args);
export const signOut: AuthBackend['signOut'] = (...args) => backend.signOut(...args);
export const getCurrentUser: AuthBackend['getCurrentUser'] = (...args) => backend.getCurrentUser(...args);
export const subscribeToSessionEnd: AuthBackend['subscribeToSessionEnd'] = (...args) =>
  backend.subscribeToSessionEnd(...args);
