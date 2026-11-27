import { useEffect } from 'react';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useSession } from '@/context/SessionContext';
import { obtainPushToken, pushSupported, urlFromNotification } from '@/lib/pushNotifications';
import { registerDevice } from '@/services/push.service';

/**
 * RF09 · Dentro de la app autenticada:
 * - después de iniciar sesión (no al abrir la app por primera vez) pide el permiso y registra el
 *   celular para recibir las push;
 * - al tocar una notificación abre su pantalla (data.url), también si abrió la app desde ella.
 */
export function usePushNotifications() {
  const { user } = useSession();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    obtainPushToken()
      .then((token) => (active && token ? registerDevice(token) : undefined))
      // Sin push la app funciona igual: no se interrumpe a la persona.
      .catch((error) => {
        if (__DEV__) console.warn('[RF09] No se pudo registrar el celular:', error);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!pushSupported) return;
    const open = (notification: Notifications.Notification) => {
      const url = urlFromNotification(notification);
      if (url) router.push(url as Parameters<typeof router.push>[0]);
    };

    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification));
    return () => subscription.remove();
  }, []);
}
