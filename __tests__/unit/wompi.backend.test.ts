import { conciliarPendientes, MINUTOS_PARA_CONCILIAR } from '../../supabase/functions/_shared/conciliacion';
import { sincronizarPago, type BaseDeDatos } from '../../supabase/functions/_shared/sincronizar';
import { procesarWebhook } from '../../supabase/functions/_shared/webhook';
import {
  WOMPI_API,
  ambienteDeLlave,
  eventChecksum,
  fetchTransactionById,
  integritySignature,
  type WompiEvent,
  type WompiTransaction,
} from '../../supabase/functions/_shared/wompi';

// RF15 · Pruebas de la lógica de las Edge Functions de Wompi, sin Supabase ni Wompi reales:
// la base de datos y el API de Wompi se reemplazan por dobles que registran cómo se los llama.

// Las Edge Functions corren en Deno, que trae Web Crypto; en Jest se usa el de Node.
const nodeCrypto = jest.requireActual('crypto') as { webcrypto: Crypto };
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto });
}

// Secretos de ejemplo con el formato de Sandbox (no son llaves reales).
const EVENTS_SECRET = 'test_events_ejemplo123';
const PRIVATE_KEY = 'prv_test_ejemplo123';
const REFERENCIA = 'CNV-56-20261006103000-A1B2C3';

type Respuestas = Record<string, unknown | ((args: Record<string, unknown>) => unknown)>;

/** Base de datos de prueba: cada función devuelve lo indicado (un Error se devuelve como error). */
function baseDeDatos(respuestas: Respuestas) {
  const rpc = jest.fn(async (nombre: string, args: Record<string, unknown> = {}) => {
    const respuesta = respuestas[nombre];
    const valor = typeof respuesta === 'function' ? respuesta(args) : respuesta;
    return valor instanceof Error ? { data: null, error: valor } : { data: valor ?? null, error: null };
  });
  return { db: { rpc } as BaseDeDatos, rpc };
}

const credenciales = (ambiente = 'sandbox') => [
  { conjunto_id: 'c1', ambiente, llave_privada: PRIVATE_KEY, secreto_eventos: EVENTS_SECRET },
];

/** API de Wompi de prueba: devuelve las transacciones de cada referencia. */
function wompi(transacciones: Record<string, WompiTransaction[]>, status = 200) {
  return jest.fn(async (url: string) => {
    const referencia = decodeURIComponent(new URL(url).searchParams.get('reference') ?? '');
    return { ok: status === 200, status, json: async () => ({ data: transacciones[referencia] ?? [] }) } as Response;
  });
}

const transaccion = (status: WompiTransaction['status'], extra: Partial<WompiTransaction> = {}): WompiTransaction => ({
  id: '12211851-1791244176-40978',
  reference: REFERENCIA,
  status,
  amount_in_cents: 300000,
  payment_method_type: 'CARD',
  created_at: '2026-10-06T10:00:00Z',
  ...extra,
});

async function eventoFirmado(status: WompiTransaction['status'] = 'APPROVED', secreto = EVENTS_SECRET): Promise<WompiEvent> {
  const evento: WompiEvent = {
    event: 'transaction.updated',
    data: { transaction: transaccion(status) },
    environment: 'test',
    signature: { properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'], checksum: '' },
    timestamp: 1759750000,
  };
  evento.signature.checksum = (await eventChecksum(evento, secreto)).toUpperCase();
  return evento;
}

describe('RF15 · Firma de integridad (crear pago)', () => {
  it('coincide con el ejemplo oficial de la documentación de Wompi', async () => {
    expect(
      await integritySignature('sk8-438k4-xmxm392-sn2m', 2490000, 'COP', 'prod_integrity_Z5mMke9x0k8gpErbDqwrJXMqsI6SFli6'),
    ).toBe('37c8407747e595535433ef8f6a811d853cd943046624a0ec04662b17bbf33bf5');
  });

  it('cambia si cambia el valor, la referencia o el secreto (no se puede alterar el monto)', async () => {
    const base = await integritySignature(REFERENCIA, 300000, 'COP', 'test_integrity_x');
    expect(await integritySignature(REFERENCIA, 300001, 'COP', 'test_integrity_x')).not.toBe(base);
    expect(await integritySignature(`${REFERENCIA}-2`, 300000, 'COP', 'test_integrity_x')).not.toBe(base);
    expect(await integritySignature(REFERENCIA, 300000, 'COP', 'test_integrity_y')).not.toBe(base);
  });
});

describe('RF15 · Ambientes Sandbox y Producción', () => {
  it('reconoce el ambiente por el prefijo de la llave pública', () => {
    expect(ambienteDeLlave('pub_test_abc')).toBe('sandbox');
    expect(ambienteDeLlave('pub_prod_abc')).toBe('produccion');
    expect(ambienteDeLlave('prv_test_abc')).toBeNull();
  });

  it('consulta el API del ambiente del conjunto', async () => {
    for (const ambiente of ['sandbox', 'produccion'] as const) {
      const { db } = baseDeDatos({ credenciales_wompi: credenciales(ambiente), aplicar_estado_wompi: 'APROBADA' });
      const fetcher = wompi({ [REFERENCIA]: [transaccion('APPROVED')] });

      await sincronizarPago(db, REFERENCIA, fetcher as unknown as typeof fetch);

      expect(fetcher.mock.calls[0][0]).toBe(`${WOMPI_API[ambiente]}/transactions?reference=${REFERENCIA}`);
    }
  });
});

describe('RF15 · Consultar estado en Wompi', () => {
  it('aplica en la base de datos el estado, el ID y el medio que reporta Wompi', async () => {
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales(), aplicar_estado_wompi: 'APROBADA' });
    const fetcher = wompi({ [REFERENCIA]: [transaccion('APPROVED')] });

    const resultado = await sincronizarPago(db, REFERENCIA, fetcher as unknown as typeof fetch);

    expect(rpc).toHaveBeenCalledWith('aplicar_estado_wompi', {
      p_referencia: REFERENCIA,
      p_wompi_id: '12211851-1791244176-40978',
      p_estado_wompi: 'APPROVED',
      p_medio: 'CARD',
    });
    expect(resultado).toEqual({ estado: 'APROBADA', enWompi: true, wompiId: '12211851-1791244176-40978', medio: 'CARD' });
  });

  it('usa el intento más reciente si hay varios con la misma referencia', async () => {
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales(), aplicar_estado_wompi: 'RECHAZADA' });
    const fetcher = wompi({
      [REFERENCIA]: [
        transaccion('APPROVED', { id: 'viejo', created_at: '2026-10-06T09:00:00Z' }),
        transaccion('DECLINED', { id: 'nuevo', created_at: '2026-10-06T10:00:00Z' }),
      ],
    });

    await sincronizarPago(db, REFERENCIA, fetcher as unknown as typeof fetch);

    expect(rpc).toHaveBeenCalledWith('aplicar_estado_wompi', expect.objectContaining({ p_wompi_id: 'nuevo', p_estado_wompi: 'DECLINED' }));
  });

  it('si Wompi no tiene la transacción no cambia nada (la persona no pagó)', async () => {
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales() });

    const resultado = await sincronizarPago(db, REFERENCIA, wompi({}) as unknown as typeof fetch);

    expect(resultado).toEqual({ estado: null, enWompi: false });
    expect(rpc).not.toHaveBeenCalledWith('aplicar_estado_wompi', expect.anything());
  });

  it('falla si el conjunto no tiene llave privada configurada', async () => {
    const { db } = baseDeDatos({ credenciales_wompi: [{ ambiente: 'sandbox', llave_privada: null }] });

    await expect(sincronizarPago(db, REFERENCIA, wompi({}) as unknown as typeof fetch)).rejects.toThrow(
      'wompi_no_configurado',
    );
  });
});

describe('RF15 · Webhook transaction.updated', () => {
  it('procesa un evento auténtico y aplica el pago (APPROVED)', async () => {
    const evento = await eventoFirmado('APPROVED');
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales(), procesar_evento_wompi: 'APROBADA' });

    const respuesta = await procesarWebhook(db, evento);

    expect(respuesta).toEqual({ status: 200, body: { ok: true, resultado: 'APROBADA' } });
    expect(rpc).toHaveBeenCalledWith('credenciales_wompi', { p_referencia: REFERENCIA });
    expect(rpc).toHaveBeenCalledWith('procesar_evento_wompi', { p_checksum: evento.signature.checksum, p_evento: evento });
  });

  it('procesa una anulación (VOIDED) para que la base de datos devuelva el saldo', async () => {
    const evento = await eventoFirmado('VOIDED');
    const { db } = baseDeDatos({ credenciales_wompi: credenciales(), procesar_evento_wompi: 'ANULADA' });

    expect(await procesarWebhook(db, evento)).toEqual({ status: 200, body: { ok: true, resultado: 'ANULADA' } });
  });

  it('es idempotente: un evento repetido responde 200 sin volver a aplicarse', async () => {
    const evento = await eventoFirmado('APPROVED');
    const { db } = baseDeDatos({ credenciales_wompi: credenciales(), procesar_evento_wompi: 'duplicado' });

    // 200 para que Wompi no lo reintente; la base de datos detectó el checksum repetido.
    expect(await procesarWebhook(db, evento)).toEqual({ status: 200, body: { ok: true, resultado: 'duplicado' } });
  });

  it('descarta un evento con checksum falso o alterado (no lo procesa)', async () => {
    const alterado = await eventoFirmado('APPROVED');
    alterado.data.transaction!.amount_in_cents = 1; // alguien cambió el valor después de firmar
    const otroSecreto = await eventoFirmado('APPROVED', 'test_events_de_otro_comercio');

    for (const evento of [alterado, otroSecreto]) {
      const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales() });
      expect(await procesarWebhook(db, evento)).toEqual({ status: 401, body: { error: 'invalid_checksum' } });
      expect(rpc).not.toHaveBeenCalledWith('procesar_evento_wompi', expect.anything());
    }
  });

  it('descarta el evento si el conjunto no tiene secreto de eventos configurado', async () => {
    const { db } = baseDeDatos({ credenciales_wompi: [{ ...credenciales()[0], secreto_eventos: null }] });

    expect((await procesarWebhook(db, await eventoFirmado())).status).toBe(401);
  });

  it('ignora con 200 los eventos de otro tipo o de referencias que no son de Convive', async () => {
    const otroTipo = { ...(await eventoFirmado()), event: 'nequi_token.updated' };
    const ajeno = await eventoFirmado();
    const { db, rpc } = baseDeDatos({ credenciales_wompi: [] });

    expect(await procesarWebhook(db, otroTipo)).toEqual({ status: 200, body: { ok: true, ignorado: true } });
    expect(await procesarWebhook(db, ajeno)).toEqual({ status: 200, body: { ok: true, ignorado: true } });
    expect(rpc).not.toHaveBeenCalledWith('procesar_evento_wompi', expect.anything());
  });

  it('responde 500 si falla la base de datos, para que Wompi reintente', async () => {
    const evento = await eventoFirmado();
    const sinCredenciales = baseDeDatos({ credenciales_wompi: new Error('db caída') });
    const sinProcesar = baseDeDatos({ credenciales_wompi: credenciales(), procesar_evento_wompi: new Error('db caída') });

    expect((await procesarWebhook(sinCredenciales.db, evento)).status).toBe(500);
    expect((await procesarWebhook(sinProcesar.db, evento)).status).toBe(500);
  });
});

describe('RF15 · Conciliación automática (cada 15 min, pendientes de más de 30 min)', () => {
  const TOKEN = 'token-de-la-tarea';

  it('rechaza llamadas sin el token de la tarea programada', async () => {
    const { db, rpc } = baseDeDatos({ token_conciliacion_valido: false });

    expect(await conciliarPendientes(db, 'otro', wompi({}) as unknown as typeof fetch)).toEqual({
      status: 401,
      body: { error: 'unauthorized' },
    });
    expect(rpc).not.toHaveBeenCalledWith('pendientes_por_conciliar', expect.anything());
  });

  it(`busca los pendientes de más de ${MINUTOS_PARA_CONCILIAR} minutos y actualiza su estado`, async () => {
    const { db, rpc } = baseDeDatos({
      token_conciliacion_valido: ({ p_token }: Record<string, unknown>) => p_token === TOKEN,
      pendientes_por_conciliar: [{ referencia: 'CNV-A' }, { referencia: 'CNV-B' }, { referencia: 'CNV-C' }],
      credenciales_wompi: credenciales(),
      aplicar_estado_wompi: ({ p_estado_wompi }: Record<string, unknown>) =>
        p_estado_wompi === 'APPROVED' ? 'APROBADA' : 'RECHAZADA',
    });
    const fetcher = wompi({
      'CNV-A': [transaccion('APPROVED', { reference: 'CNV-A' })],
      'CNV-B': [transaccion('DECLINED', { reference: 'CNV-B' })],
      // CNV-C: Wompi no la tiene, la persona nunca terminó el pago.
    });

    const respuesta = await conciliarPendientes(db, TOKEN, fetcher as unknown as typeof fetch);

    expect(rpc).toHaveBeenCalledWith('pendientes_por_conciliar', { p_minutos: 30 });
    expect(respuesta).toEqual({
      status: 200,
      body: { ok: true, revisados: 3, resultados: { 'CNV-A': 'APROBADA', 'CNV-B': 'RECHAZADA', 'CNV-C': 'CANCELADA' } },
    });
    // El abandonado se cancela para que no bloquee nuevos pagos del concepto.
    expect(rpc).toHaveBeenCalledWith('cancelar_pago_abandonado', { p_referencia: 'CNV-C' });
    expect(rpc).not.toHaveBeenCalledWith('cancelar_pago_abandonado', { p_referencia: 'CNV-A' });
  });

  it('un pago con error no detiene la conciliación de los demás', async () => {
    const { db } = baseDeDatos({
      token_conciliacion_valido: true,
      pendientes_por_conciliar: [{ referencia: 'CNV-A' }, { referencia: 'CNV-B' }],
      credenciales_wompi: credenciales(),
      aplicar_estado_wompi: 'APROBADA',
    });
    const fetcher = jest.fn(async (url: string) =>
      url.includes('CNV-A')
        ? ({ ok: false, status: 503 } as Response)
        : ({ ok: true, status: 200, json: async () => ({ data: [transaccion('APPROVED', { reference: 'CNV-B' })] }) } as Response),
    );

    const respuesta = await conciliarPendientes(db, TOKEN, fetcher as unknown as typeof fetch);

    expect(respuesta.body.resultados).toEqual({ 'CNV-A': 'error', 'CNV-B': 'APROBADA' });
  });

  it('sin pendientes no consulta Wompi', async () => {
    const { db } = baseDeDatos({ token_conciliacion_valido: true, pendientes_por_conciliar: [] });
    const fetcher = wompi({});

    expect(await conciliarPendientes(db, TOKEN, fetcher as unknown as typeof fetch)).toEqual({
      status: 200,
      body: { ok: true, revisados: 0, resultados: {} },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('RF13 · Consultar estado por ID de Wompi (GET /transactions/{id})', () => {
  /** API de Wompi de prueba para GET /transactions/{id}. */
  const wompiPorId = (transacciones: Record<string, WompiTransaction>) =>
    jest.fn(async (url: string) => {
      const id = decodeURIComponent(url.split('/transactions/')[1] ?? '');
      const encontrada = transacciones[id];
      return {
        ok: Boolean(encontrada),
        status: encontrada ? 200 : 404,
        json: async () => ({ data: encontrada }),
      } as Response;
    });

  it('si ya se conoce el ID de Wompi, consulta GET /transactions/{id}', async () => {
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales(), aplicar_estado_wompi: 'APROBADA' });
    const fetcher = wompiPorId({ 'w-123': transaccion('APPROVED', { id: 'w-123' }) });

    const resultado = await sincronizarPago(db, REFERENCIA, fetcher as unknown as typeof fetch, 'w-123');

    expect(fetcher).toHaveBeenCalledWith(`${WOMPI_API.sandbox}/transactions/w-123`, {
      headers: { Authorization: `Bearer ${PRIVATE_KEY}` },
    });
    expect(rpc).toHaveBeenCalledWith('aplicar_estado_wompi', expect.objectContaining({ p_wompi_id: 'w-123' }));
    expect(resultado).toMatchObject({ estado: 'APROBADA', enWompi: true });
  });

  it('si Wompi no encuentra ese ID, no cambia nada', async () => {
    const { db, rpc } = baseDeDatos({ credenciales_wompi: credenciales() });

    const resultado = await sincronizarPago(db, REFERENCIA, wompiPorId({}) as unknown as typeof fetch, 'w-no-existe');

    expect(resultado).toEqual({ estado: null, enWompi: false });
    expect(rpc).not.toHaveBeenCalledWith('aplicar_estado_wompi', expect.anything());
  });

  it('sin ID de Wompi (recién vuelve del checkout) busca por la referencia de Convive', async () => {
    const { db } = baseDeDatos({ credenciales_wompi: credenciales(), aplicar_estado_wompi: 'APROBADA' });
    const fetcher = wompi({ [REFERENCIA]: [transaccion('APPROVED')] });

    await sincronizarPago(db, REFERENCIA, fetcher as unknown as typeof fetch, null);

    expect(fetcher.mock.calls[0][0]).toBe(`${WOMPI_API.sandbox}/transactions?reference=${REFERENCIA}`);
  });

  it('falla si Wompi responde con otro error', async () => {
    const fetcher = jest.fn(async () => ({ ok: false, status: 500 }) as Response);

    await expect(fetchTransactionById('sandbox', PRIVATE_KEY, 'w-1', fetcher as unknown as typeof fetch)).rejects.toThrow(
      'wompi_500',
    );
  });
});
