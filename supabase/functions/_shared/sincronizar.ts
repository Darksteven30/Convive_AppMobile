// Consulta en el API de Wompi el estado de un pago y lo aplica en la base de datos (RF15).
// Lo usan wompi-estado (cuando la app pregunta) y wompi-conciliar (tarea cada 15 minutos).
// Recibe la base de datos como dependencia para poder probarlo sin Supabase (Jest).

import { fetchTransactionById, fetchTransactionsByReference, latestTransaction, type Ambiente } from './wompi.ts';

/** Lo mínimo que se usa del cliente de Supabase (service_role): llamar funciones de la base de datos. */
export type BaseDeDatos = {
  rpc(nombre: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

export type Sincronizacion = {
  /** Estado de la transacción en Convive después de sincronizar. */
  estado: string | null;
  /** false si Wompi aún no tiene ninguna transacción con esa referencia. */
  enWompi: boolean;
  wompiId?: string;
  medio?: string;
};

type Credenciales = { ambiente: Ambiente; llave_privada: string | null; secreto_eventos: string | null };

/** Credenciales del conjunto al que pertenece el pago (null si la referencia no es de Convive). */
export async function credencialesDelPago(db: BaseDeDatos, referencia: string): Promise<Credenciales | null> {
  const { data, error } = await db.rpc('credenciales_wompi', { p_referencia: referencia });
  if (error) throw error;
  const filas = (Array.isArray(data) ? data : data ? [data] : []) as Credenciales[];
  return filas[0] ?? null;
}

/**
 * wompiId: si ya se conoce (lo guardó el webhook), se consulta GET /transactions/{id}; si no (la persona
 * acaba de volver del checkout), se busca por la referencia de Convive.
 */
export async function sincronizarPago(
  db: BaseDeDatos,
  referencia: string,
  fetcher: typeof fetch = fetch,
  wompiId?: string | null,
): Promise<Sincronizacion> {
  const credenciales = await credencialesDelPago(db, referencia);
  if (!credenciales?.llave_privada) {
    throw new Error('wompi_no_configurado');
  }

  const transaccion = wompiId
    ? await fetchTransactionById(credenciales.ambiente, credenciales.llave_privada, wompiId, fetcher)
    : latestTransaction(
        await fetchTransactionsByReference(credenciales.ambiente, credenciales.llave_privada, referencia, fetcher),
      );
  if (!transaccion) {
    return { estado: null, enWompi: false };
  }

  const { data: estado, error } = await db.rpc('aplicar_estado_wompi', {
    p_referencia: referencia,
    p_wompi_id: transaccion.id,
    p_estado_wompi: transaccion.status,
    p_medio: transaccion.payment_method_type ?? null,
  });
  if (error) throw error;
  return { estado: estado as string, enWompi: true, wompiId: transaccion.id, medio: transaccion.payment_method_type };
}
