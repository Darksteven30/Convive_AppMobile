import { act, fireEvent, screen } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { authConfig, resetMockAuthState } from '@/services/auth.service';

type Element = Parameters<typeof fireEvent.press>[0];

/**
 * Renderiza la app real (src/app) con Expo Router en la ruta indicada.
 *
 * - Restaura los datos del servicio simulado y desactiva su latencia, para que inicio y
 *   cierre de sesión se resuelvan dentro del act() de cada evento.
 * - Con Testing Library v14, renderRouter devuelve la promesa de render con los helpers
 *   del router adjuntos; se guarda la referencia antes de esperarla porque al resolverla
 *   esos helpers se pierden.
 */
export async function renderApp(initialUrl = '/') {
  resetMockAuthState();
  authConfig.networkDelayMs = 0;
  const rendered = renderRouter('./src/app', { initialUrl });
  await rendered;
  return {
    getPathname: () => rendered.getPathname(),
  };
}

/**
 * Pulsa un elemento y deja que se completen las redirecciones de los guards.
 * Solo avanza unos milisegundos para no cerrar los Toast (duran 3 s).
 */
export async function press(element: Element) {
  await fireEvent.press(element);
  await act(() => jest.advanceTimersByTimeAsync(50));
}

/** Navega a una ruta como si el usuario la abriera directamente. */
export async function navigate(href: Href) {
  await act(() => router.navigate(href));
}

/** Paso 1 del login: escribe el correo y pulsa «Continuar». */
export async function submitEmail(email: string) {
  await fireEvent.changeText(screen.getByLabelText('Correo electrónico'), email);
  await press(screen.getByRole('button', { name: 'Continuar' }));
}

/** Paso 2 del login: escribe la contraseña y pulsa «Iniciar sesión». */
export async function submitPassword(password: string) {
  await fireEvent.changeText(screen.getByLabelText('Contraseña'), password);
  await press(screen.getByRole('button', { name: 'Iniciar sesión' }));
}

/** Inicia sesión desde el login como lo haría un usuario (correo → contraseña). */
export async function signInAs(email: string, password: string) {
  await submitEmail(email);
  await submitPassword(password);
}

/** Renderiza la app y entra con el usuario indicado. */
export async function renderSignedIn(email: string, password: string) {
  const app = await renderApp('/');
  await signInAs(email, password);
  return app;
}
