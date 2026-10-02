import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FeedbackProvider } from '@/context/FeedbackContext';
import { SessionProvider, useSession } from '@/context/SessionContext';

export default function RootLayout() {
  return (
    <SessionProvider>
      <FeedbackProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </FeedbackProvider>
    </SessionProvider>
  );
}

/**
 * Guards de autenticación: sin sesión solo se puede acceder a (auth);
 * con sesión, solo a (app). Expo Router redirige solo al cambiar la sesión.
 */
function RootNavigator() {
  const { user } = useSession();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
