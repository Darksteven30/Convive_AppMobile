import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionProvider, useSession } from '@/context/SessionContext';
import { resetMockAuthState } from '@/services/auth.service';

beforeEach(() => {
  jest.useFakeTimers();
  resetMockAuthState();
});
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

  it('crea la contraseña de una cuenta pre-registrada y deja la sesión iniciada', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });

    await act(async () => {
      const pending = result.current.createPassword('nuevo@convive.com', 'NuevaClave1');
      await jest.runAllTimersAsync();
      await pending;
    });

    expect(result.current.user?.name).toBe('Laura Gómez');
    expect(result.current.role).toBe('residente');
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

  it('updatePhone actualiza el teléfono del usuario en sesión', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });
    await act(async () => {
      const pending = result.current.signIn('monica@gmail.com', 'Residente123');
      await jest.runAllTimersAsync();
      await pending;
    });
    await act(async () => {
      const pending = result.current.updatePhone('3001112233');
      await jest.runAllTimersAsync();
      await pending;
    });

    expect(result.current.user?.phone).toBe('300 111 2233');
  });

  it('changePassword usa el correo del usuario en sesión', async () => {
    const { result } = await renderHook(() => useSession(), { wrapper });
    await act(async () => {
      const pending = result.current.signIn('monica@gmail.com', 'Residente123');
      await jest.runAllTimersAsync();
      await pending;
    });
    await act(async () => {
      const pending = result.current.changePassword('Residente123', 'NuevaClave1');
      await jest.runAllTimersAsync();
      await pending;
    });
    await act(async () => {
      const pending = result.current.signOut();
      await jest.runAllTimersAsync();
      await pending;
    });
    await act(async () => {
      const pending = result.current.signIn('monica@gmail.com', 'NuevaClave1');
      await jest.runAllTimersAsync();
      await pending;
    });

    expect(result.current.user?.name).toBe('Monica Galvis');
  });

  it('lanza un error si se usa fuera del SessionProvider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(() => useSession())).rejects.toThrow(
      'useSession debe usarse dentro de <SessionProvider>.',
    );
  });
});
