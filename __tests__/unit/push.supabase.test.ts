import { registerDevice, resetMockPushState, unregisterDevice } from '@/services/push.service';

// Cliente de Supabase simulado: se verifica cómo se llaman las funciones de
// 20261127000000_notificaciones_push.sql.
const mockRpc = jest.fn(async (_name: string, _args?: unknown) => ({ data: null, error: null as unknown }));

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  resetMockPushState();
});

describe('registro del celular con Supabase (RF09)', () => {
  it('registra el token con la plataforma y lo elimina al cerrar sesión', async () => {
    await registerDevice('ExponentPushToken[abc]');
    // jest-expo corre las pruebas como iOS por defecto.
    expect(mockRpc).toHaveBeenCalledWith('registrar_dispositivo_push', {
      p_token: 'ExponentPushToken[abc]',
      p_plataforma: 'ios',
    });

    await unregisterDevice();
    expect(mockRpc).toHaveBeenCalledWith('eliminar_dispositivo_push', { p_token: 'ExponentPushToken[abc]' });
  });

  it('sin celular registrado, cerrar sesión no llama al servidor', async () => {
    await unregisterDevice();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('si el servidor rechaza el registro, el error llega a quien llama', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'token_invalido' } });
    await expect(registerDevice('ExponentPushToken[abc]')).rejects.toMatchObject({ message: 'token_invalido' });
  });
});
