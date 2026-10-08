// Lógica del webhook de Wompi (RF15), separada de Deno para poder probarla con Jest.
// Respuestas: 200 = recibido (Wompi no reintenta); otro código = Wompi reintenta (30 min, 3 h, 24 h).

import { credencialesDelPago, type BaseDeDatos } from './sincronizar.ts';
import { isAuthenticEvent, type WompiEvent } from './wompi.ts';

export type RespuestaWebhook = { status: number; body: Record<string, unknown> };

export async function procesarWebhook(db: BaseDeDatos, evento: WompiEvent): Promise<RespuestaWebhook> {
  const referencia = evento?.data?.transaction?.reference;
  if (evento?.event !== 'transaction.updated' || !referencia) {
    // Otros eventos no le interesan a Convive.
    return { status: 200, body: { ok: true, ignorado: true } };
  }

  let credenciales;
  try {
    credenciales = await credencialesDelPago(db, referencia);
  } catch {
    return { status: 500, body: { error: 'server_error' } };
  }
  if (!credenciales) {
    // Referencia que no es de Convive: se confirma para que Wompi no reintente.
    return { status: 200, body: { ok: true, ignorado: true } };
  }

  // Si el checksum no coincide, el evento se descarta (no es de Wompi o fue alterado).
  if (!credenciales.secreto_eventos || !(await isAuthenticEvent(evento, credenciales.secreto_eventos))) {
    return { status: 401, body: { error: 'invalid_checksum' } };
  }

  // Registra el evento y aplica el estado en una sola transacción (idempotente por checksum).
  const { data: resultado, error } = await db.rpc('procesar_evento_wompi', {
    p_checksum: evento.signature.checksum,
    p_evento: evento,
  });
  if (error) {
    return { status: 500, body: { error: 'server_error' } };
  }

  // TODO(RF09): enviar la notificación push con el resultado del pago cuando exista el RF09.
  return { status: 200, body: { ok: true, resultado } };
}
