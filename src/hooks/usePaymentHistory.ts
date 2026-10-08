import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { useSession } from '@/context/SessionContext';
import { getPaymentHistory, type PaymentHistoryFilters, type PaymentResult } from '@/services/payments.service';

type Loaded = { key: string; payments: PaymentResult[] | null; failed: boolean };

/**
 * RF02 · Historial de pagos APROBADOS de la unidad en el periodo elegido. Se consulta al tener el
 * foco y cada vez que cambia el periodo; con enabled=false (periodo inválido) no consulta nada.
 * Lo cargado se asocia al periodo, así que al cambiarlo nunca se muestra la lista del anterior.
 */
export function usePaymentHistory(filters: PaymentHistoryFilters, enabled = true) {
  const { user } = useSession();
  const { from, to } = filters;
  const key = `${from}|${to}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const request = useRef(0);

  const reload = useCallback(async () => {
    if (!user || !enabled) return;
    const id = ++request.current;
    setLoaded((current) => (current?.key === key ? { ...current, failed: false } : current));
    try {
      const payments = await getPaymentHistory(user, { from, to });
      if (id === request.current) setLoaded({ key, payments, failed: false });
    } catch {
      if (id === request.current) setLoaded({ key, payments: null, failed: true });
    }
  }, [user, enabled, key, from, to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        request.current += 1;
      };
    }, [reload]),
  );

  const current = loaded?.key === key ? loaded : null;
  const payments = current?.payments ?? null;
  const failed = current?.failed ?? false;
  return { payments, failed, loading: enabled && !payments && !failed, reload };
}
