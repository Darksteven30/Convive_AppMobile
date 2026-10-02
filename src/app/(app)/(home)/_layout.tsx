import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'inicio',
};

// Las secciones de las pestañas superiores se reemplazan sin animación,
// el resto de pantallas se apilan con la transición por defecto.
const sectionOptions = { animation: 'none' } as const;

export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="inicio" options={sectionOptions} />
      <Stack.Screen name="pagos" options={sectionOptions} />
      <Stack.Screen name="reservas" options={sectionOptions} />
      <Stack.Screen name="general" options={sectionOptions} />
    </Stack>
  );
}
