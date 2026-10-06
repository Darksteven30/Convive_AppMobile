// Lógica de Wompi compartida por las Edge Functions (RF15). No depende de Deno ni de Supabase, así
// que también la prueban las pruebas de Jest (__tests__/unit/wompi.functions.test.ts).
// Referencia: https://docs.wompi.co/docs/colombia/eventos/ y /ambientes-y-llaves/

export type Ambiente = 'sandbox' | 'produccion';

/** Estados de una transacción en Wompi. */
export type WompiStatus = 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'PENDING';

export type WompiTransaction = {
  id: string;
  reference: string;
  status: WompiStatus;
  amount_in_cents: number;
  payment_method_type?: string;
  created_at?: string;
};

/** Evento que Wompi envía al webhook. */
export type WompiEvent = {
  event: string;
  data: { transaction?: WompiTransaction } & Record<string, unknown>;
  environment?: string;
  signature: { properties: string[]; checksum: string };
  timestamp: number;
  sent_at?: string;
};

export const WOMPI_API: Record<Ambiente, string> = {
  sandbox: 'https://sandbox.wompi.co/v1',
  produccion: 'https://production.wompi.co/v1',
};

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Firma de integridad de Wompi: SHA-256 de referencia + monto en centavos + moneda + secreto de
 * integridad. La calcula iniciar_pago() en la base de datos (nunca la app); esta versión sirve para
 * comprobar la fórmula en las pruebas.
 */
export function integritySignature(reference: string, amountInCents: number, currency: string, secret: string) {
  return sha256Hex(`${reference}${amountInCents}${currency}${secret}`);
}

/** Ambiente según el prefijo de la llave pública: pub_test_ → sandbox, pub_prod_ → produccion. */
export function ambienteDeLlave(publicKey: string): Ambiente | null {
  if (publicKey.startsWith('pub_test_')) return 'sandbox';
  if (publicKey.startsWith('pub_prod_')) return 'produccion';
  return null;
}

/** Valor de una propiedad del evento, p. ej. «transaction.id» dentro de data. */
function valueAt(data: Record<string, unknown>, path: string): string {
  const value = path.split('.').reduce<unknown>(
    (current, key) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined),
    data,
  );
  return value === undefined || value === null ? '' : String(value);
}

/**
 * Checksum del evento según Wompi: SHA-256 de los valores de signature.properties (en orden),
 * seguidos del timestamp y del secreto de eventos.
 */
export async function eventChecksum(event: WompiEvent, eventsSecret: string): Promise<string> {
  const values = event.signature.properties.map((path) => valueAt(event.data, path)).join('');
  return sha256Hex(`${values}${event.timestamp}${eventsSecret}`);
}

/** true si el checksum recibido (en el cuerpo o en el encabezado X-Event-Checksum) es auténtico. */
export async function isAuthenticEvent(event: WompiEvent, eventsSecret: string): Promise<boolean> {
  if (!event?.signature?.checksum || !Array.isArray(event.signature.properties) || !eventsSecret) {
    return false;
  }
  const expected = await eventChecksum(event, eventsSecret);
  return expected.toUpperCase() === event.signature.checksum.toUpperCase();
}

/** La transacción más reciente de Wompi para una referencia (puede haber varios intentos). */
export function latestTransaction(transactions: WompiTransaction[]): WompiTransaction | null {
  if (transactions.length === 0) return null;
  return [...transactions].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
}

/** Una transacción de Wompi por su ID (GET /transactions/{id}); null si Wompi no la tiene. */
export async function fetchTransactionById(
  ambiente: Ambiente,
  privateKey: string,
  wompiId: string,
  fetcher: typeof fetch = fetch,
): Promise<WompiTransaction | null> {
  const url = `${WOMPI_API[ambiente]}/transactions/${encodeURIComponent(wompiId)}`;
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${privateKey}` } });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`wompi_${response.status}`);
  }
  const body = (await response.json()) as { data?: WompiTransaction };
  return body.data ?? null;
}

/** Transacciones de Wompi con esa referencia. Requiere la llave privada del conjunto. */
export async function fetchTransactionsByReference(
  ambiente: Ambiente,
  privateKey: string,
  reference: string,
  fetcher: typeof fetch = fetch,
): Promise<WompiTransaction[]> {
  const url = `${WOMPI_API[ambiente]}/transactions?reference=${encodeURIComponent(reference)}`;
  const response = await fetcher(url, { headers: { Authorization: `Bearer ${privateKey}` } });
  if (!response.ok) {
    throw new Error(`wompi_${response.status}`);
  }
  const body = (await response.json()) as { data?: WompiTransaction[] };
  return body.data ?? [];
}
