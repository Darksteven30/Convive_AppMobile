import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useSession } from '@/context/SessionContext';
import { getAccountStatus, type AccountStatus } from '@/services/payments.service';

/**
 * Estado de la cuenta de la unidad del usuario (RF02 y RF11): saldo total y saldo por concepto.
 * Se recarga cada vez que la pantalla vuelve a tener el foco. Con enabled=false no consulta nada
 * (p. ej. Inicio de un rol sin acceso a Pagos). `reload` devuelve una promesa para «Reintentar» y
 * para «deslizar hacia abajo».
 */
export function useAccountStatus(enabled = true) {
  const { user } = useSession();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [failed, setFailed] = useState(false);
  // Solo la última consulta actualiza el estado (al perder el foco se descartan las anteriores).
  const request = useRef(0);

  const reload = useCallback(async () => {
    if (!user || !enabled) return;
    const id = ++request.current;
    setFailed(false);
    try {
      const value = await getAccountStatus(user);
      if (id === request.current) setStatus(value);
    } catch {
      if (id === request.current) setFailed(true);
    }
  }, [user, enabled]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        request.current += 1;
      };
    }, [reload]),
  );

  return { status, failed, loading: !status && !failed, reload };
}
