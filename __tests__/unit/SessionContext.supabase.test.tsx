import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SessionProvider, useSession } from '@/context/SessionContext';
import type { User } from '@/services/auth.types';

// Simula auth.service en modo Supabase: la sesión se restaura al abrir la app y puede vencer.
const mockUser: User = {
  id: 'p1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '311 123 4567',
  house: '56',
  address: 'Casa # 56 Cali - Valle',
  role: 'residente',
};
let mockSessionEnd: (() => void) | null = null;
const mockGetCurrentUser = jest.fn();

jest.mock('@/services/auth.service', () => ({
  ...jest.requireActual('@/services/auth.types'),
  restoresSession: true,
  getCurrentUser: () => mockGetCurrentUser(),
  subscribeToSessionEnd: (listener: () => void) => {
    mockSessionEnd = listener;
    return () => (mockSessionEnd = null);
  },
  signOut: jest.fn(async () => {}),
}));

const wrapper = ({ children }: { children: ReactNode }) => <SessionProvider>{children}</SessionProvider>;

beforeEach(() => {
  mockSessionEnd = null;
  mockGetCurrentUser.mockReset();
});

describe('SessionContext con Supabase', () => {
  it('restaura la sesión guardada al abrir la app', async () => {
    let resolve: (user: User) => void = () => {};
    mockGetCurrentUser.mockReturnValue(new Promise<User>((r) => (resolve = r)));

    const { result } = await renderHook(() => useSession(), { wrapper });
    expect(result.current.restoring).toBe(true);
    expect(result.current.user).toBeNull();

    await act(async () => resolve(mockUser));
    expect(result.current.restoring).toBe(false);
    expect(result.current.role).toBe('residente');
  });

  it('sin sesión guardada termina de cargar sin usuario', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await act(async () => {});

    expect(result.current.restoring).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('«Tu sesión expiró»: si la sesión termina sola, borra el usuario y lo indica', async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await act(async () => {});
    expect(result.current.user).not.toBeNull();

    await act(async () => mockSessionEnd?.());
    expect(result.current.user).toBeNull();
    expect(result.current.sessionExpired).toBe(true);

    await act(async () => result.current.dismissSessionExpired());
    expect(result.current.sessionExpired).toBe(false);
  });

  it('si no había usuario, el fin de la sesión no muestra el aviso', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const { result } = await renderHook(() => useSession(), { wrapper });
    await act(async () => {});

    await act(async () => mockSessionEnd?.());
    expect(result.current.sessionExpired).toBe(false);
  });
});
