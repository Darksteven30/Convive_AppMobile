// Lógica de la conciliación automática (RF15), separada de Deno para poder probarla con Jest.
// Revisa en Wompi los pagos PENDIENTES de más de 30 minutos, por si el webhook no llegó. Si Wompi
// no tiene la transacción, la persona nunca terminó el pago: se cancela para que no bloquee nuevos
// pagos del mismo concepto.

import { sincronizarPago, type BaseDeDatos } from './sincronizar.ts';

export const MINUTOS_PARA_CONCILIAR = 30;

export type RespuestaConciliacion = { status: number; body: Record<string, unknown> };

export async function conciliarPendientes(
  db: BaseDeDatos,
  token: string | null,
  fetcher: typeof fetch = fetch,
): Promise<RespuestaConciliacion> {
  // Solo la tarea programada conoce el token (guardado en el Vault).
  const { data: autorizado } = await db.rpc('token_conciliacion_valido', { p_token: token });
  if (!autorizado) {
    return { status: 401, body: { error: 'unauthorized' } };
  }

  const { data: pendientes, error } = await db.rpc('pendientes_por_conciliar', {
    p_minutos: MINUTOS_PARA_CONCILIAR,
  });
  if (error) {
    return { status: 500, body: { error: 'server_error' } };
  }

  const resultados: Record<string, string> = {};
  for (const { referencia } of (pendientes ?? []) as { referencia: string }[]) {
    try {
      const sincronizacion = await sincronizarPago(db, referencia, fetcher);
      if (!sincronizacion.enWompi) {
        await db.rpc('cancelar_pago_abandonado', { p_referencia: referencia });
        resultados[referencia] = 'CANCELADA';
      } else {
        resultados[referencia] = sincronizacion.estado ?? 'desconocido';
      }
    } catch {
      // Un pago con problemas no detiene la conciliación de los demás.
      resultados[referencia] = 'error';
    }
  }

  return { status: 200, body: { ok: true, revisados: Object.keys(resultados).length, resultados } };
}
