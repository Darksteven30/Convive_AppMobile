import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionProvider, useSession } from '@/context/SessionContext';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

describe('SessionContext', () => {
  it('inicia sin usuario ni rol', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('guarda el usuario y su rol al iniciar sesión', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });

    await act(async () => {
      const pending = result.current.signIn('junta@convive.com', 'Junta123');
      await jest.runAllTimersAsync();
      await pending;
    });

    expect(result.current.user?.name).toBe('Carlos Rojas');
    expect(result.current.role).toBe('junta_directiva');
  });

  it('mantiene la sesión vacía si las credenciales son incorrectas', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });

    await act(async () => {
      const assertion = expect(result.current.signIn('junta@convive.com', 'mala')).rejects.toThrow();
      await jest.runAllTimersAsync();
      await assertion;
    });

    expect(result.current.user).toBeNull();
  });

  it('limpia el usuario al cerrar sesión', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });

    await act(async () => {
      const pending = result.current.signIn('admin@convive.com', 'Admin123');
      await jest.runAllTimersAsync();
      await pending;
    });
    await act(async () => {
      const pending = result.current.signOut();
      await jest.runAllTimersAsync();
      await pending;
    });

    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeNull();
  });

  it('lanza un error si se usa fuera del SessionProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useSession())).rejects.toThrow(
      'useSession debe usarse dentro de <SessionProvider>.',
    );
  });
});
