// Clientes de Supabase para las Edge Functions. SUPABASE_URL, SUPABASE_ANON_KEY y
// SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase en cada función; no se configuran a mano.

import { createClient } from 'npm:@supabase/supabase-js@2';

/** Cliente con permisos de servidor: lee las llaves del Vault y aplica estados. Nunca sale de aquí. */
export function clienteAdmin() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Cliente con la sesión de quien llama: respeta Row Level Security (solo ve sus pagos). */
export function clienteDelUsuario(authorization: string) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
