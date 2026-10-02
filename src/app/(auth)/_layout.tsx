import { Stack } from 'expo-router';

// Layout del grupo (auth): sin él, el Stack.Protected de la raíz no encuentra la ruta "(auth)".
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
