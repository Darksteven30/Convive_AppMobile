import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import * as authService from '@/services/auth.service';
import type { Role, User } from '@/services/auth.service';

type SessionContextValue = {
  user: User | null;
  role: Role | null;
  signIn: (email: string, password: string) => Promise<User>;
  /** Crea la primera contraseña de una cuenta pre-registrada e inicia sesión. */
  createPassword: (email: string, password: string) => Promise<User>;
  /** RF17: cambia la contraseña del usuario en sesión. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  /** RF16: actualiza el teléfono del usuario en sesión. */
  updatePhone: (phone: string) => Promise<User>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Guarda el usuario autenticado y lo expone a toda la app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const sessionEmail = user?.email;

  const signIn = useCallback(async (email: string, password: string) => {
    const authenticated = await authService.signIn(email, password);
    setUser(authenticated);
    return authenticated;
  }, []);

  const createPassword = useCallback(async (email: string, password: string) => {
    const authenticated = await authService.createPassword(email, password);
    setUser(authenticated);
    return authenticated;
  }, []);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!sessionEmail) throw new authService.AuthError('not_found');
      await authService.changePassword(sessionEmail, currentPassword, newPassword);
    },
    [sessionEmail],
  );

  const updatePhone = useCallback(
    async (phone: string) => {
      if (!sessionEmail) throw new authService.AuthError('not_found');
      const updated = await authService.updatePhone(sessionEmail, phone);
      setUser(updated);
      return updated;
    },
    [sessionEmail],
  );

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, signIn, createPassword, changePassword, updatePhone, signOut }),
    [user, signIn, createPassword, changePassword, updatePhone, signOut],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const context = use(SessionContext);
  if (!context) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  }
  return context;
}
