import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { press, renderApp, renderSignedIn, signInAs } from '../helpers/app';

afterEach(() => jest.useRealTimers());

describe('RF01 · flujo de autenticación', () => {
  it('sin sesión, la entrada a la app lleva al login', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/sign-in');
    expect(screen.getByText('Inicia sesión')).toBeTruthy();
  });

  it('sin sesión, no se puede abrir una pantalla interna escribiendo la ruta', async () => {
    const app = await renderApp('/inicio');
    expect(app.getPathname()).not.toBe('/inicio');
    expect(screen.queryByText('Estado de la cuenta')).toBeNull();
  });

  it('pide correo y contraseña si los campos están vacíos', async () => {
    const app = await renderApp('/');
    await fireEvent.press(screen.getByText('Continuar'));

    expect(screen.getByText('Ingresa tu correo y contraseña.')).toBeTruthy();
    expect(app.getPathname()).toBe('/sign-in');
  });

  it('muestra un error con credenciales incorrectas y no entra', async () => {
    const app = await renderApp('/');
    await signInAs('admin@convive.com', 'incorrecta');

    expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy();
    expect(app.getPathname()).toBe('/sign-in');
  });

  it('con credenciales válidas entra al inicio', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    expect(app.getPathname()).toBe('/inicio');
    expect(screen.getByText('Últimas noticias')).toBeTruthy();
  });

  it('con sesión activa no se puede volver al login', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await act(() => router.navigate('/sign-in'));

    expect(app.getPathname()).not.toBe('/sign-in');
    expect(screen.queryByText('Inicia sesión')).toBeNull();
  });

  it('cerrar sesión regresa al login y bloquea de nuevo la app', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');

    await fireEvent.press(screen.getByLabelText('Ver perfil'));
    expect(app.getPathname()).toBe('/perfil');

    await press(screen.getByText('Cerrar sesión'));
    expect(app.getPathname()).toBe('/sign-in');

    await act(() => router.navigate('/inicio'));
    expect(app.getPathname()).not.toBe('/inicio');
  });
});
