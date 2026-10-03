import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useSession } from '@/context/SessionContext';
import { getAccountStatus, type AccountStatus } from '@/services/payments.service';

/**
 * Estado de la cuenta de la unidad del usuario (RF11): saldo total y saldo por concepto.
 * Se recarga cada vez que la pantalla vuelve a tener el foco. Con enabled=false no consulta nada
 * (p. ej. Inicio de un rol sin acceso a Pagos).
 */
export function useAccountStatus(enabled = true) {
  const { user } = useSession();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!user || !enabled) return undefined;
    let active = true;
    setFailed(false);
    getAccountStatus(user).then(
      (value) => active && setStatus(value),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [user, enabled]);

  useFocusEffect(load);

  return { status, failed, loading: !status && !failed, reload: load };
}
