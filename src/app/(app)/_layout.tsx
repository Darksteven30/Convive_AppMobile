import { useEffect, useRef, type ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import Tabs from 'expo-router/js-tabs';

import { homeRouteFor } from '@/constants/permissions';
import { colors } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';

// Pantalla a la que llegan los guards al iniciar sesión (primera de la pila de Inicio).
const DEFAULT_LANDING = '/inicio';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabIcon = (active: IconName, inactive: IconName) => {
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Ionicons name={focused ? active : inactive} size={24} color={color} />;
  }
  return TabIcon;
};

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

/** Barra de navegación inferior presente en toda la app autenticada. */
export default function AppLayout() {
  useRedirectToRoleHome();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.tabInactive,
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{ title: 'Inicio', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="buscar"
        options={{ title: 'Buscar', tabBarIcon: tabIcon('search', 'search-outline') }}
      />
      <Tabs.Screen
        name="movimientos"
        options={{ title: 'Movimientos', tabBarIcon: tabIcon('swap-horizontal', 'swap-horizontal-outline') }}
      />
      <Tabs.Screen
        name="billetera"
        options={{ title: 'Billetera', tabBarIcon: tabIcon('wallet', 'wallet-outline') }}
      />
    </Tabs>
  );
}
