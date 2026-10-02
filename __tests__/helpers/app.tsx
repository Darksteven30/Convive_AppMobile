import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { authConfig } from '@/services/auth.service';

type Element = Parameters<typeof fireEvent.press>[0];

/**
 * Renderiza la app real (src/app) con Expo Router en la ruta indicada.
 *
 * - Se desactiva la latencia simulada del servicio para que inicio y cierre de sesión
 *   se resuelvan dentro del act() de cada evento.
 * - Con Testing Library v14, renderRouter devuelve la promesa de render con los helpers
 *   del router adjuntos; se guarda la referencia antes de esperarla porque al resolverla
 *   esos helpers se pierden.
 */
export async function renderApp(initialUrl = '/') {
  authConfig.networkDelayMs = 0;
  const rendered = renderRouter('./src/app', { initialUrl });
  await rendered;
  return {
    getPathname: () => rendered.getPathname(),
  };
}

/** Pulsa un elemento y deja que se completen las redirecciones de los guards. */
export async function press(element: Element) {
  await fireEvent.press(element);
  await act(() => jest.runOnlyPendingTimersAsync());
}

/** Inicia sesión desde la pantalla de login como lo haría un usuario. */
export async function signInAs(email: string, password: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('correoelectrónico@dominio.com'), email);
  await fireEvent.changeText(screen.getByPlaceholderText('Contraseña'), password);
  await press(screen.getByText('Continuar'));
}

/** Renderiza la app y entra con el usuario indicado. */
export async function renderSignedIn(email: string, password: string) {
  const app = await renderApp('/');
  await signInAs(email, password);
  return app;
}
