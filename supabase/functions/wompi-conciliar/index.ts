// RF15 · Conciliación automática. pg_cron la llama cada 15 minutos (ver la migración
// 20261006000000_integracion_wompi.sql) con el encabezado x-conciliacion-token.
// La lógica está en _shared/conciliacion.ts (probada en __tests__/unit/wompi.functions.test.ts).

import { clienteAdmin, json } from '../_shared/clientes.ts';
import { conciliarPendientes } from '../_shared/conciliacion.ts';

Deno.serve(async (request) => {
  const { status, body } = await conciliarPendientes(clienteAdmin(), request.headers.get('x-conciliacion-token'));
  if (status !== 200) {
    console.warn('wompi-conciliar', status, body);
  }
  return json(body, status);
});
