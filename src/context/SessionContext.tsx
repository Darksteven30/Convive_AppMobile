import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';

import * as authService from '@/services/auth.service';
import type { Role, User } from '@/services/auth.service';

type SessionContextValue = {
  user: User | null;
  role: Role | null;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

/** Guarda el usuario autenticado y lo expone a toda la app. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const signIn = useCallback(async (email: string, password: string) => {
    const authenticated = await authService.signIn(email, password);
    setUser(authenticated);
    return authenticated;
  }, []);

  const signOut = useCallback(async () => {
    await authService.signOut();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, role: user?.role ?? null, signIn, signOut }),
    [user, signIn, signOut],
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
