// Autenticación con Supabase (RF01, RF16, RF17). Cumple el mismo contrato que el servicio simulado
// (auth.types.ts). Las reglas viven en el servidor: el esquema y las funciones están en
// supabase/migrations/20261003000000_autenticacion.sql.

import { isAuthApiError } from '@supabase/supabase-js';

import { getSupabase } from '@/lib/supabase';
import { AuthError, initialsFor, type AuthBackend, type EmailStatus, type Role, type User } from '@/services/auth.types';
import { formatPhone, isValidPhone, meetsPasswordRules, normalizeEmail, normalizePhone } from '@/utils/validation';

/** Fila que devuelve la función mi_perfil() de la base de datos. */
type ProfileRow = {
  id: string;
  email: string;
  nombre: string;
  telefono: string | null;
  rol: Role;
  unidad: string | null;
  direccion: string | null;
  conjunto: string;
};

/** Mientras sea true, el cierre de sesión lo pidió la app: no es una sesión vencida. */
let signingOut = false;

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw error;
  return data as T;
}

const errorCode = (error: unknown) => (isAuthApiError(error) ? error.code : undefined);

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.nombre,
    initials: initialsFor(row.nombre),
    email: row.email,
    phone: row.telefono ? formatPhone(row.telefono) : '',
    house: row.unidad ?? '',
    address: row.direccion ?? row.conjunto,
    complex: row.conjunto,
    role: row.rol,
  };
}

/** Perfil (nombre, unidad y rol) del usuario con sesión iniciada. */
async function loadProfile(): Promise<User> {
  const { data, error } = await getSupabase().rpc('mi_perfil').maybeSingle<ProfileRow>();
  if (error) throw error;
  if (!data) throw new AuthError('not_found');
  return toUser(data);
}

async function signOutWith(scope: 'local' | 'others') {
  signingOut = true;
  try {
    await getSupabase().auth.signOut({ scope });
  } finally {
    signingOut = false;
  }
}

export async function lookupEmail(email: string): Promise<EmailStatus> {
  return rpc<EmailStatus>('estado_correo', { p_email: normalizeEmail(email) });
}

export async function signIn(email: string, password: string): Promise<User> {
  const key = normalizeEmail(email);
  if ((await rpc<number>('minutos_bloqueo', { p_email: key })) > 0) {
    throw new AuthError('locked');
  }

  const { error } = await getSupabase().auth.signInWithPassword({ email: key, password });
  if (error) {
    if (errorCode(error) === 'invalid_credentials') {
      const remaining = await rpc<number>('registrar_intento', { p_email: key, p_exitoso: false });
      throw remaining <= 0 ? new AuthError('locked') : new AuthError('invalid_credentials', remaining);
    }
    if (errorCode(error) === 'email_not_confirmed') throw new AuthError('confirmation_required');
    throw error;
  }

  await rpc('registrar_intento', { p_email: key, p_exitoso: true });
  return loadProfile();
}

export async function createPassword(email: string, password: string): Promise<User> {
  const key = normalizeEmail(email);
  const status = await lookupEmail(key);
  if (status === 'not_found') throw new AuthError('not_found');
  if (status === 'registered') throw new AuthError('password_already_set');

  // El trigger vincular_perfil enlaza el nuevo usuario con su perfil pre-registrado.
  const { data, error } = await getSupabase().auth.signUp({ email: key, password });
  if (error) {
    if (errorCode(error) === 'user_already_exists') throw new AuthError('password_already_set');
    if (errorCode(error) === 'weak_password') throw new AuthError('weak_password');
    throw error;
  }
  // Si el proyecto exige confirmar el correo no hay sesión todavía.
  if (!data.session) throw new AuthError('confirmation_required');
  return loadProfile();
}

export async function requestPasswordReset(email: string): Promise<void> {
  const key = normalizeEmail(email);
  if ((await lookupEmail(key)) === 'not_found') throw new AuthError('not_found');
  // La plantilla «Reset Password» de Supabase debe enviar el código {{ .Token }} (ver README).
  const { error } = await getSupabase().auth.resetPasswordForEmail(key);
  if (error) throw error;
}

export async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  const client = getSupabase();
  const { error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: code, type: 'recovery' });
  if (error) {
    if (isAuthApiError(error)) throw new AuthError('invalid_code');
    throw error;
  }

  // verifyOtp abre una sesión temporal: se usa para cambiar la contraseña y se cierra enseguida,
  // porque el flujo de RF01 pide volver a iniciar sesión con la nueva contraseña.
  try {
    const { error: updateError } = await client.auth.updateUser({ password: newPassword });
    if (updateError) {
      if (errorCode(updateError) === 'weak_password') throw new AuthError('weak_password');
      if (errorCode(updateError) === 'same_password') throw new AuthError('same_password');
      throw updateError;
    }
    await rpc('desbloquear_cuenta');
  } finally {
    await signOutWith('local');
  }
}

export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<void> {
  if (newPassword === currentPassword) throw new AuthError('same_password');
  if (!meetsPasswordRules(newPassword)) throw new AuthError('weak_password');

  const client = getSupabase();
  // Se verifica la contraseña actual volviendo a autenticar al usuario.
  const { error: authError } = await client.auth.signInWithPassword({ email: normalizeEmail(email), password: currentPassword });
  if (authError) {
    if (errorCode(authError) === 'invalid_credentials') throw new AuthError('wrong_password');
    throw authError;
  }

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    if (errorCode(error) === 'same_password') throw new AuthError('same_password');
    if (errorCode(error) === 'weak_password') throw new AuthError('weak_password');
    throw error;
  }
  // RF17: al cambiar la contraseña se cierra la sesión en los demás dispositivos.
  await signOutWith('others');
}

export async function updatePhone(_email: string, phone: string): Promise<User> {
  if (!isValidPhone(phone)) throw new AuthError('invalid_phone');
  try {
    await rpc('actualizar_telefono', { p_telefono: normalizePhone(phone) });
  } catch (error) {
    if (error instanceof Error && error.message.includes('invalid_phone')) throw new AuthError('invalid_phone');
    throw error;
  }
  return loadProfile();
}

export async function signOut(): Promise<void> {
  await signOutWith('local');
}

export async function getCurrentUser(): Promise<User | null> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) return null;
  try {
    return await loadProfile();
  } catch {
    // Sesión guardada pero sin perfil (p. ej. el perfil se borró): se descarta.
    await signOutWith('local');
    return null;
  }
}

export function subscribeToSessionEnd(listener: () => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((event) => {
    // No se llama a Supabase dentro de este callback: solo se avisa a la app.
    if (event === 'SIGNED_OUT' && !signingOut) listener();
  });
  return () => data.subscription.unsubscribe();
}

/** Implementación del contrato AuthBackend que usa auth.service.ts. */
export const authBackend = {
  lookupEmail,
  signIn,
  createPassword,
  requestPasswordReset,
  resetPassword,
  changePassword,
  updatePhone,
  signOut,
  getCurrentUser,
  subscribeToSessionEnd,
} satisfies AuthBackend;
