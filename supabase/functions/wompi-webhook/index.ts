// RF15 · Webhook de eventos de Wompi (transaction.updated).
// Wompi no envía sesión de Supabase: la autenticidad se comprueba con el checksum del evento y el
// secreto de eventos del conjunto (config.toml: verify_jwt = false). La lógica está en
// _shared/webhook.ts (probada en __tests__/unit/wompi.functions.test.ts).

import { clienteAdmin, json } from '../_shared/clientes.ts';
import { procesarWebhook } from '../_shared/webhook.ts';
import type { WompiEvent } from '../_shared/wompi.ts';

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let evento: WompiEvent;
  try {
    evento = await request.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { status, body } = await procesarWebhook(clienteAdmin(), evento);
  if (status !== 200) {
    console.warn('wompi-webhook', status, body, evento?.data?.transaction?.reference);
  }
  return json(body, status);
});
