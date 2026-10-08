import { useEffect } from 'react';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { MSG } from '@/constants/messages';
import { FeedbackProvider, useFeedback } from '@/context/FeedbackContext';
import { SessionProvider, useSession } from '@/context/SessionContext';
import { restoresSession } from '@/services/auth.service';

// Con Supabase, la pantalla de carga se mantiene hasta restaurar la sesión guardada.
if (restoresSession) {
  SplashScreen.preventAutoHideAsync();
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <FeedbackProvider>
        <StatusBar style="dark" />
        <SplashScreenController />
        <SessionExpiredDialog />
        <RootNavigator />
      </FeedbackProvider>
    </SessionProvider>
  );
}

function SplashScreenController() {
  const { restoring } = useSession();
  if (restoresSession && !restoring) {
    SplashScreen.hide();
  }
  return null;
}

/** Convenciones 7.2: «Tu sesión expiró…» [Aceptar] → los guards llevan al inicio de sesión. */
function SessionExpiredDialog() {
  const { sessionExpired, dismissSessionExpired } = useSession();
  const { showDialog } = useFeedback();

  useEffect(() => {
    if (!sessionExpired) return;
    dismissSessionExpired();
    showDialog({ message: MSG.general.sessionExpired, actions: [{ label: 'Aceptar', primary: true }] });
  }, [sessionExpired, dismissSessionExpired, showDialog]);

  return null;
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
