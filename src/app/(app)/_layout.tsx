import { useEffect, useRef } from 'react';
import { router, Slot, usePathname } from 'expo-router';

import { homeRouteFor } from '@/constants/permissions';
import { useSession } from '@/context/SessionContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';

// Pantalla a la que llegan los guards al iniciar sesión (primera de la pila de Inicio).
const DEFAULT_LANDING = '/inicio';

/**
 * RF01: al entrar, cada rol va a su pantalla principal (Admin → Panel, Vigilancia → Visitantes…).
 * Solo redirige si se llegó a la pantalla por defecto, para no anular un enlace abierto a otra ruta.
 */
function useRedirectToRoleHome() {
  const { role } = useSession();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    // Mientras la ruta sea «/» (index) la navegación inicial aún no termina.
    if (handled.current || !role || pathname === '/') return;
    handled.current = true;
    const home = homeRouteFor(role);
    if (pathname === DEFAULT_LANDING && home !== DEFAULT_LANDING) {
      router.replace(home);
    }
  }, [role, pathname]);
}

/**
 * App autenticada. Las secciones se recorren con la barra superior (SegmentedTabs) de cada
 * pantalla; RF18: la barra inferior se quitó porque Buscar, Movimientos y Billetera no tienen un
 * requisito en el documento (solo mostraban «Próximamente»).
 */
export default function AppLayout() {
  useRedirectToRoleHome();
  // RF09: registra el celular para las push y abre la pantalla de la notificación tocada.
  usePushNotifications();

  return <Slot />;
}
