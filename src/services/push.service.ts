// RF09 · Registro del celular para las notificaciones push. Con Supabase guarda el Expo push token
// en dispositivos_push (20261127000000_notificaciones_push.sql), y la base de datos envía cada
// notificación nueva a los celulares de la persona. En modo simulado no hay servidor que envíe:
// solo se recuerda el token para que el flujo (y las pruebas) sea el mismo.

import { Platform } from 'react-native';

import { getSupabase, isSupabaseEnabled } from '@/lib/supabase';

/** Celular registrado en esta sesión, para quitarlo al cerrar sesión. */
let registeredToken: string | null = null;

/** Solo para las pruebas: el celular registrado en el modo simulado. */
export function mockRegisteredToken() {
  return registeredToken;
}

/** Solo para las pruebas: olvida el celular registrado. */
export function resetMockPushState() {
  registeredToken = null;
}

/** Asocia el celular a la persona con sesión iniciada. */
export async function registerDevice(token: string): Promise<void> {
  if (isSupabaseEnabled) {
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const { error } = await getSupabase().rpc('registrar_dispositivo_push', { p_token: token, p_plataforma: platform });
    if (error) throw error;
  }
  registeredToken = token;
}

/**
 * Al cerrar sesión el celular deja de recibir los avisos de esa cuenta. Debe llamarse antes de
 * cerrar la sesión de Supabase (la función del servidor necesita saber quién la llama).
 */
export async function unregisterDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token || !isSupabaseEnabled) return;
  const { error } = await getSupabase().rpc('eliminar_dispositivo_push', { p_token: token });
  if (error) throw error;
}
