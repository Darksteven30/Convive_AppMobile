// Pagos con Supabase (RF11). Cumple el mismo contrato que el servicio simulado (payments.types.ts).
// El catálogo, la cartera y la función mi_estado_cuenta() están en
// supabase/migrations/20261004000000_seleccion_concepto_pago.sql.

import { getSupabase } from '@/lib/supabase';
import { buildAccountStatus, type AccountStatus, type PaymentsBackend } from '@/services/payments.types';

/** Fila que devuelve la función mi_estado_cuenta() de la base de datos. */
type AccountRow = {
  concepto_id: string;
  nombre: string;
  requiere_descripcion: boolean;
  /** numeric(18,2): PostgREST puede devolverlo como número o como texto. */
  saldo: number | string;
};

/** La unidad sale de la sesión en el servidor (auth.uid()), no del usuario que envía la app. */
export async function getAccountStatus(): Promise<AccountStatus> {
  const { data, error } = await getSupabase().rpc('mi_estado_cuenta');
  if (error) throw error;
  return buildAccountStatus(
    ((data ?? []) as AccountRow[]).map((row) => ({
      id: row.concepto_id,
      name: row.nombre,
      requiresDescription: row.requiere_descripcion,
      balance: Number(row.saldo),
    })),
  );
}

/** Implementación del contrato PaymentsBackend que usa payments.service.ts. */
export const paymentsBackend = { getAccountStatus } satisfies PaymentsBackend;
