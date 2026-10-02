import { Stack } from 'expo-router';

import { hasPermission } from '@/constants/permissions';
import { useSession } from '@/context/SessionContext';

export const unstable_settings = {
  initialRouteName: 'inicio',
};

// Las secciones de las pestañas superiores se reemplazan sin animación,
// el resto de pantallas se apilan con la transición por defecto.
const sectionOptions = { animation: 'none' } as const;

export default function HomeLayout() {
  const { role } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="inicio" options={sectionOptions} />
      <Stack.Screen name="reservas" options={sectionOptions} />

      {/* Guards por rol: ver src/constants/permissions.ts */}
      <Stack.Protected guard={hasPermission(role, 'pagos')}>
        <Stack.Screen name="pagos" options={sectionOptions} />
        <Stack.Screen name="pago/seleccion" />
        <Stack.Screen name="pago/aplicar" />
        <Stack.Screen name="pago/confirmacion" />
      </Stack.Protected>
      <Stack.Protected guard={hasPermission(role, 'general')}>
        <Stack.Screen name="general" options={sectionOptions} />
      </Stack.Protected>
      <Stack.Protected guard={hasPermission(role, 'panel')}>
        <Stack.Screen name="panel" options={sectionOptions} />
      </Stack.Protected>
      <Stack.Protected guard={hasPermission(role, 'finanzas')}>
        <Stack.Screen name="finanzas/index" />
        <Stack.Screen name="finanzas/nuevo" />
      </Stack.Protected>
      <Stack.Protected guard={hasPermission(role, 'visitantes')}>
        <Stack.Screen name="visitantes" options={sectionOptions} />
      </Stack.Protected>
    </Stack>
  );
}
