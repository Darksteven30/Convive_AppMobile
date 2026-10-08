import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as authService from '@/services/auth.service';
import type { Role, User } from '@/services/auth.service';

type SessionContextValue = {
  user: User | null;
  role: Role | null;
  /** true mientras se restaura la sesión guardada en el dispositivo al abrir la app. */
  restoring: boolean;
  /** true cuando la sesión terminó sola (venció o se cerró desde otro dispositivo). */
  sessionExpired: boolean;
  dismissSessionExpired: () => void;
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
  const [restoring, setRestoring] = useState(authService.restoresSession);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef(user);
  const sessionEmail = user?.email;

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Con Supabase la sesión queda guardada: al abrir la app se recupera el usuario.
  useEffect(() => {
    if (!authService.restoresSession) return;
    let active = true;
    authService
      .getCurrentUser()
      .then((restored) => active && setUser(restored))
      .catch(() => active && setUser(null))
      .finally(() => active && setRestoring(false));
    return () => {
      active = false;
    };
  }, []);

  // Convenciones 7.2: si la sesión termina sin que el usuario la cierre, se avisa «Tu sesión expiró».
  useEffect(
    () =>
      authService.subscribeToSessionEnd(() => {
        if (!userRef.current) return;
        setUser(null);
        setSessionExpired(true);
      }),
    [],
  );

  const dismissSessionExpired = useCallback(() => setSessionExpired(false), []);

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
    () => ({
      user,
      role: user?.role ?? null,
      restoring,
      sessionExpired,
      dismissSessionExpired,
      signIn,
      createPassword,
      changePassword,
      updatePhone,
      signOut,
    }),
    [user, restoring, sessionExpired, dismissSessionExpired, signIn, createPassword, changePassword, updatePhone, signOut],
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
