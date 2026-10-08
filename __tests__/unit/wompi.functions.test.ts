import {
  WOMPI_API,
  eventChecksum,
  fetchTransactionsByReference,
  isAuthenticEvent,
  latestTransaction,
  sha256Hex,
  type WompiEvent,
} from '../../supabase/functions/_shared/wompi';

// Las Edge Functions corren en Deno, que trae Web Crypto; en Jest se usa el de Node.
const nodeCrypto = jest.requireActual('crypto') as {
  webcrypto: Crypto;
  createHash: (algorithm: string) => { update: (text: string) => { digest: (encoding: 'hex') => string } };
};
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto });
}

// Secreto de ejemplo con el formato de Sandbox (no es una llave real).
const EVENTS_SECRET = 'test_events_ejemplo123';

/** SHA-256 con la librería de Node: una implementación independiente para comparar. */
const nodeSha256 = (text: string) => nodeCrypto.createHash('sha256').update(text).digest('hex');

function buildEvent(overrides: Partial<WompiEvent['data']['transaction']> = {}): WompiEvent {
  const transaction = {
    id: '1234-1610641025-49201',
    reference: 'CNV-56-20261006103000-A1B2C3',
    status: 'APPROVED' as const,
    amount_in_cents: 4490000,
    payment_method_type: 'NEQUI',
    ...overrides,
  };
  const timestamp = 1530291411;
  return {
    event: 'transaction.updated',
    data: { transaction },
    environment: 'test',
    signature: {
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      // Checksum como lo calcula Wompi (documentación de eventos).
      checksum: nodeSha256(
        `${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${EVENTS_SECRET}`,
      ).toUpperCase(),
    },
    timestamp,
  };
}

describe('RF15 · Firma y checksum de Wompi', () => {
  it('sha256Hex da el resultado estándar de SHA-256', async () => {
    // Vector de prueba oficial de SHA-256 (FIPS 180-2).
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const text = 'CNV-56-20261006103000-A1B2C33500000COPtest_integrity_ejemplo';
    expect(await sha256Hex(text)).toBe(nodeSha256(text));
  });

  it('calcula el checksum del evento con las propiedades en orden, el timestamp y el secreto', async () => {
    const event = buildEvent();
    // Ejemplo de la documentación: 1234-1610641025-49201 + APPROVED + 4490000 + 1530291411 + secreto.
    const expected = nodeSha256(`1234-1610641025-49201APPROVED44900001530291411${EVENTS_SECRET}`);

    expect(await eventChecksum(event, EVENTS_SECRET)).toBe(expected);
  });

  it('acepta un evento auténtico (sin importar mayúsculas del checksum)', async () => {
    const event = buildEvent();
    expect(await isAuthenticEvent(event, EVENTS_SECRET)).toBe(true);

    event.signature.checksum = event.signature.checksum.toLowerCase();
    expect(await isAuthenticEvent(event, EVENTS_SECRET)).toBe(true);
  });

  it('descarta un evento alterado o firmado con otro secreto', async () => {
    const altered = buildEvent();
    altered.data.transaction!.amount_in_cents = 100; // alguien cambió el valor
    expect(await isAuthenticEvent(altered, EVENTS_SECRET)).toBe(false);

    const statusChanged = buildEvent();
    statusChanged.data.transaction!.status = 'DECLINED';
    expect(await isAuthenticEvent(statusChanged, EVENTS_SECRET)).toBe(false);

    expect(await isAuthenticEvent(buildEvent(), 'test_events_otro')).toBe(false);
  });

  it('descarta eventos sin firma o sin secreto configurado', async () => {
    const unsigned = { ...buildEvent(), signature: undefined } as unknown as WompiEvent;
    expect(await isAuthenticEvent(unsigned, EVENTS_SECRET)).toBe(false);
    expect(await isAuthenticEvent(buildEvent(), '')).toBe(false);
  });
});

describe('RF15 · Consulta de transacciones en el API de Wompi', () => {
  const okResponse = (data: unknown) =>
    Promise.resolve({ ok: true, status: 200, json: async () => ({ data }) } as Response);

  it('usa la URL del ambiente y la llave privada como Bearer', async () => {
    const fetcher = jest.fn((..._args: Parameters<typeof fetch>) => okResponse([]));

    await fetchTransactionsByReference('sandbox', 'prv_test_ejemplo', 'CNV-56-1 2', fetcher as typeof fetch);
    await fetchTransactionsByReference('produccion', 'prv_prod_ejemplo', 'CNV-56-1', fetcher as typeof fetch);

    expect(fetcher).toHaveBeenNthCalledWith(1, `${WOMPI_API.sandbox}/transactions?reference=CNV-56-1%202`, {
      headers: { Authorization: 'Bearer prv_test_ejemplo' },
    });
    expect(fetcher.mock.calls[1][0]).toBe('https://production.wompi.co/v1/transactions?reference=CNV-56-1');
    expect(WOMPI_API.sandbox).toBe('https://sandbox.wompi.co/v1');
  });

  it('falla si Wompi responde con error', async () => {
    const fetcher = jest.fn(() => Promise.resolve({ ok: false, status: 401 } as Response));

    await expect(
      fetchTransactionsByReference('sandbox', 'prv_test_malo', 'CNV-56-1', fetcher as typeof fetch),
    ).rejects.toThrow('wompi_401');
  });

  it('elige el intento más reciente de una referencia', () => {
    expect(latestTransaction([])).toBeNull();
    expect(
      latestTransaction([
        { id: 'a', reference: 'R', status: 'DECLINED', amount_in_cents: 1, created_at: '2026-10-06T10:00:00Z' },
        { id: 'b', reference: 'R', status: 'APPROVED', amount_in_cents: 1, created_at: '2026-10-06T10:05:00Z' },
      ])?.id,
    ).toBe('b');
  });
});
