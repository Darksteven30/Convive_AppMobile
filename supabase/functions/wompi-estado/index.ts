// RF15 · Consultar el estado de un pago en el API de Wompi (GET /transactions?reference=…).
// La llama la app con la sesión de la persona; solo puede consultar pagos de su unidad (RLS).
// Si Wompi no tiene ninguna transacción con esa referencia, la persona no terminó el pago.

import { clienteAdmin, clienteDelUsuario, json } from '../_shared/clientes.ts';
import { sincronizarPago } from '../_shared/sincronizar.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const responder = (body: unknown, status = 200) => {
  const response = json(body, status);
  Object.entries(cors).forEach(([key, value]) => response.headers.set(key, value));
  return response;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return responder({ error: 'unauthorized' }, 401);
  }

  const { referencia } = (await request.json().catch(() => ({}))) as { referencia?: string };
  if (!referencia) {
    return responder({ error: 'referencia_requerida' }, 400);
  }

  // Con la sesión de la persona: si el pago no es de su unidad, RLS no lo devuelve.
  const { data: pago } = await clienteDelUsuario(authorization)
    .from('transacciones_pago')
    .select('referencia')
    .eq('referencia', referencia)
    .maybeSingle();
  if (!pago) {
    return responder({ error: 'not_found' }, 404);
  }

  try {
    return responder(await sincronizarPago(clienteAdmin(), referencia));
  } catch (error) {
    console.error('wompi-estado', referencia, error);
    return responder({ error: 'wompi_no_disponible' }, 503);
  }
});
