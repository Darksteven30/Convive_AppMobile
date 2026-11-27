// Último perfil cargado con conexión, guardado en el dispositivo (RF16). Al abrir la app sin señal,
// la sesión de Supabase sigue siendo válida pero no se puede consultar mi_perfil(): con esta copia
// la persona entra igual en lugar de quedar en el inicio de sesión. Se borra al cerrar sesión.
// Usa el mismo almacenamiento que la sesión (expo-sqlite/localStorage en el celular, localStorage en web).

import type { User } from '@/services/auth.types';

const KEY = 'convive.perfil';

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export function saveCachedProfile(user: User): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(user));
  } catch {
    // Sin almacenamiento la app funciona igual; solo no podrá abrir sin conexión.
  }
}

export function readCachedProfile(): User | null {
  try {
    const value = storage()?.getItem(KEY);
    return value ? (JSON.parse(value) as User) : null;
  } catch {
    return null;
  }
}

export function clearCachedProfile(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nada que borrar.
  }
}
