import { act, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as Notifications from 'expo-notifications';

import { MSG } from '@/constants/messages';
import { mockRegisteredToken, resetMockPushState } from '@/services/push.service';

import { navigate, press, pressDialogButton, renderSignedIn } from '../helpers/app';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const responseTo = (url: string) =>
  ({ notification: { request: { content: { data: { url } } } } }) as unknown as Notifications.NotificationResponse;

beforeEach(() => {
  jest.clearAllMocks();
  resetMockPushState();
});

describe('RF09 · Notificaciones push en la app', () => {
  it('después de iniciar sesión registra el celular, y al cerrar sesión lo quita', async () => {
    expect(mockRegisteredToken()).toBeNull();

    await renderSignedIn('monica@gmail.com', 'Residente123');
    expect(mockRegisteredToken()).toBe('ExponentPushToken[prueba]');

    await navigate('/perfil');
    await press(screen.getByText('Cerrar sesión'));
    await pressDialogButton('Cerrar sesión');

    expect(mockRegisteredToken()).toBeNull();
  });

  it('al tocar una notificación abre su pantalla', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');
    const listener = mocked.addNotificationResponseReceivedListener.mock.calls[0][0];

    await act(async () => listener(responseTo('/perfil')));

    expect(app.getPathname()).toBe('/perfil');
  });

  it('si la app se abrió tocando una notificación, abre su pantalla al entrar', async () => {
    mocked.getLastNotificationResponse.mockReturnValue(responseTo('/pagos'));

    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    expect(app.getPathname()).toBe('/pagos');
    mocked.getLastNotificationResponse.mockReturnValue(null);
  });

  it('si la persona negó el permiso, Perfil muestra «Activar», que abre los ajustes del celular', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({ status: 'denied' } as never);
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

    await renderSignedIn('monica@gmail.com', 'Residente123');
    await navigate('/perfil');

    expect(screen.getByText(MSG.RF09.disabled)).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Activar' }));
    expect(openSettings).toHaveBeenCalled();

    mocked.getPermissionsAsync.mockResolvedValue({ status: 'granted' } as never);
    openSettings.mockRestore();
  });

  it('con el permiso concedido Perfil no muestra el aviso', async () => {
    await renderSignedIn('monica@gmail.com', 'Residente123');
    await navigate('/perfil');

    expect(screen.queryByText(MSG.RF09.disabled)).toBeNull();
  });
});
