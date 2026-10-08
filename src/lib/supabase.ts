// Cliente de Supabase (guía de Expo: https://docs.expo.dev/guides/using-supabase/).
// La URL y la clave publicable vienen de .env.local (ver .env.example). Si no están, la app usa los
// servicios simulados: así funciona sin internet, en las pruebas y para quien aún no tiene el proyecto.

import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** true cuando la app está conectada a un proyecto de Supabase. */
export const isSupabaseEnabled = Boolean(url && publishableKey);

export const supabase: SupabaseClient | null = isSupabaseEnabled
  ? createClient(url!, publishableKey!, {
      auth: {
        // Guarda la sesión en el dispositivo (SQLite en el celular, localStorage en web).
        storage: localStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Renueva el token solo mientras la app está en primer plano.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}

/** Devuelve el cliente o falla con un mensaje claro si Supabase no está configurado. */
export function getSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase no está configurado: define EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.');
  }
  return supabase;
}
