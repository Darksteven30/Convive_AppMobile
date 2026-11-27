import * as Notifications from 'expo-notifications';

import { notificationsDenied, obtainPushToken, urlFromNotification } from '@/lib/pushNotifications';
import { mockRegisteredToken, registerDevice, resetMockPushState, unregisterDevice } from '@/services/push.service';

const mocked = Notifications as jest.Mocked<typeof Notifications>;

const notificationWith = (data: Record<string, unknown>) =>
  ({ request: { content: { data } } }) as unknown as Notifications.Notification;

beforeEach(() => {
  jest.clearAllMocks();
  resetMockPushState();
});

describe('obtainPushToken (RF09)', () => {
  it('con el permiso concedido devuelve el Expo push token del celular', async () => {
    expect(await obtainPushToken()).toBe('ExponentPushToken[prueba]');
    expect(mocked.requestPermissionsAsync).not.toHaveBeenCalled();
    // Usa el projectId de EAS de app.json.
    expect(mocked.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: expect.any(String) });
  });

  it('si aún no se ha respondido, pide el permiso', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' } as never);

    expect(await obtainPushToken()).toBe('ExponentPushToken[prueba]');
    expect(mocked.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('si la persona niega el permiso no hay token', async () => {
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' } as never);
    mocked.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);

    expect(await obtainPushToken()).toBeNull();
    expect(mocked.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('si el entorno no permite push (p. ej. Expo Go en Android) no falla: devuelve null', async () => {
    mocked.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('No disponible en Expo Go'));

    expect(await obtainPushToken()).toBeNull();
  });
});

describe('notificationsDenied', () => {
  it('es true solo si la persona negó el permiso', async () => {
    expect(await notificationsDenied()).toBe(false);
    mocked.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' } as never);
    expect(await notificationsDenied()).toBe(true);
  });
});

describe('urlFromNotification', () => {
  it('devuelve la ruta de la app que trae la notificación', () => {
    expect(urlFromNotification(notificationWith({ url: '/noticias/abc' }))).toBe('/noticias/abc');
  });

  it('ignora una notificación sin ruta o con una dirección externa', () => {
    expect(urlFromNotification(notificationWith({}))).toBeNull();
    expect(urlFromNotification(notificationWith({ url: 'https://ejemplo.com' }))).toBeNull();
  });
});

describe('registro del celular (modo simulado)', () => {
  it('recuerda el celular al registrarlo y lo olvida al quitarlo', async () => {
    await registerDevice('ExponentPushToken[abc]');
    expect(mockRegisteredToken()).toBe('ExponentPushToken[abc]');

    await unregisterDevice();
    expect(mockRegisteredToken()).toBeNull();
  });
});
