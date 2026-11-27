// RF09 · Notificaciones push en el celular con expo-notifications (SDK 57).
// Las push no funcionan en Expo Go en Android desde el SDK 53 ni en la web: ahí obtainPushToken()
// devuelve null y la app sigue funcionando sin ellas. Hace falta un development build o un APK.
// Docs: https://docs.expo.dev/versions/v57.0.0/sdk/notifications/

import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

/** Canal de Android que usan las push enviadas por la base de datos (channelId «default»). */
export const ANDROID_CHANNEL_ID = 'default';

export const pushSupported = Platform.OS === 'android' || Platform.OS === 'ios';

// Con la app abierta, la notificación también se muestra arriba y en la lista.
if (pushSupported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Pide el permiso (si aún no se ha respondido) y devuelve el Expo push token del celular, o null si
 * la persona lo negó o el entorno no permite push (web, Expo Go en Android, sin projectId).
 */
export async function obtainPushToken(): Promise<string | null> {
  if (!pushSupported) return null;
  try {
    // En Android 13+ el diálogo de permiso no aparece si no existe al menos un canal.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
        name: 'Avisos de Convive',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0F766E',
      });
    }

    const current = await Notifications.getPermissionsAsync();
    const status = current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch (error) {
    // Expo Go en Android, sin red o sin credenciales de Firebase: la app sigue sin push.
    if (__DEV__) console.warn('[RF09] No se pudo obtener el push token:', error);
    return null;
  }
}

/** true si la persona negó el permiso de notificaciones (Perfil muestra «[Activar]»). */
export async function notificationsDenied(): Promise<boolean> {
  if (!pushSupported) return false;
  try {
    return (await Notifications.getPermissionsAsync()).status === 'denied';
  } catch {
    return false;
  }
}

/** Abre los ajustes de Convive en el celular para activar las notificaciones. */
export function openNotificationSettings() {
  return Linking.openSettings();
}

/** Ruta de la app que trae una notificación tocada (data.url, la define url_notificacion()). */
export function urlFromNotification(notification: Notifications.Notification): string | null {
  const url = notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
