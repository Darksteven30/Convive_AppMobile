import Tabs from 'expo-router/js-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { colors } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const tabIcon =
  (active: IconName, inactive: IconName) =>
  ({ color, focused }: { color: ColorValue; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={24} color={color} />
  );

/** Barra de navegación inferior presente en toda la app autenticada. */
export default function AppLayout() {
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
