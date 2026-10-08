import { PaymentError } from '@/services/payments.types';
import { buildCheckoutUrl, paymentsBackend as supabasePayments } from '@/services/payments.supabase';

// Cliente de Supabase simulado: se verifica cómo el servicio traduce las respuestas y los errores
// de las funciones de la base de datos al contrato de la app, sin conectarse a un proyecto real.
type RpcResult = { data: unknown; error: unknown };
let results: Record<string, RpcResult> = {};

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  const result = results[name] ?? { data: null, error: null };
  // Como supabase-js: la llamada se puede esperar directamente o con .maybeSingle().
  return Object.assign(Promise.resolve(result), {
    maybeSingle: async () => ({
      data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
      error: result.error,
    }),
  });
});

let invokeResult: RpcResult = { data: null, error: null };
const mockInvoke = jest.fn(async (_name: string, _options?: unknown) => invokeResult);

// RF13: lectura de transacciones_pago (from → select → eq → maybeSingle).
let tableResult: RpcResult = { data: null, error: null };
const mockEq = jest.fn((_column: string, _value: string) => ({ maybeSingle: async () => tableResult }));
const mockFrom = jest.fn((_table: string) => ({ select: (_columns: string) => ({ eq: mockEq }) }));

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc, functions: { invoke: mockInvoke }, from: mockFrom }),
}));

const user = {
  id: 'p1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
  complex: '',
  role: 'residente' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  results = {};
});

describe('Pagos con Supabase · estado de la cuenta (RF11)', () => {
  it('convierte las filas de mi_estado_cuenta() en el estado de la cuenta', async () => {
    results.mi_estado_cuenta = {
      data: [
        { concepto_id: 'administracion', nombre: 'Cuota administración', requiere_descripcion: false, saldo: '35000.00' },
        { concepto_id: 'extraordinaria', nombre: 'Cuota extraordinaria', requiere_descripcion: false, saldo: 0 },
        { concepto_id: 'otros', nombre: 'Otros conceptos', requiere_descripcion: true, saldo: 10678.9 },
      ],
      error: null,
    };

    const status = await supabasePayments.getAccountStatus();

    expect(mockRpc).toHaveBeenCalledWith('mi_estado_cuenta');
    expect(status.total).toBe(45678.9);
    expect(status.concepts).toEqual([
      { id: 'administracion', name: 'Cuota administración', requiresDescription: false, balance: 35000 },
      { id: 'extraordinaria', name: 'Cuota extraordinaria', requiresDescription: false, balance: 0 },
      { id: 'otros', name: 'Otros conceptos', requiresDescription: true, balance: 10678.9 },
    ]);
  });

  it('propaga el error de la base de datos', async () => {
    const error = new Error('permission denied');
    results.mi_estado_cuenta = { data: null, error };

    await expect(supabasePayments.getAccountStatus()).rejects.toBe(error);
  });
});

describe('Pagos con Supabase · pago con Wompi (RF12)', () => {
  it('lee la disponibilidad y los medios del conjunto, ignorando medios desconocidos', async () => {
    results.pasarela_pagos = { data: [{ disponible: true, medios: ['PSE', 'NEQUI', 'OTRO'] }], error: null };

    expect(await supabasePayments.getPaymentGateway()).toEqual({ available: true, methods: ['PSE', 'NEQUI'] });
  });

  it('sin configuración de Wompi no hay medios disponibles', async () => {
    results.pasarela_pagos = { data: [{ disponible: false, medios: null }], error: null };

    expect(await supabasePayments.getPaymentGateway()).toEqual({ available: false, methods: [] });
  });

  it('inicia el pago con iniciar_pago() y devuelve lo necesario para abrir Wompi', async () => {
    results.iniciar_pago = {
      data: [
        {
          transaccion_id: 'tx-1',
          referencia: 'CNV-56-20261005103000-A1B2C3',
          monto_centavos: '1067890',
          moneda: 'COP',
          firma: 'a'.repeat(64),
          llave_publica: 'pub_test_abc',
        },
      ],
      error: null,
    };

    const checkout = await supabasePayments.startPayment(user, {
      conceptId: 'otros',
      amount: 10678.9,
      description: 'Parqueadero',
    });

    expect(mockRpc).toHaveBeenCalledWith('iniciar_pago', {
      p_concepto_id: 'otros',
      p_valor: 10678.9,
      p_descripcion: 'Parqueadero',
    });
    expect(checkout).toEqual({
      transactionId: 'tx-1',
      reference: 'CNV-56-20261005103000-A1B2C3',
      amountInCents: 1067890,
      currency: 'COP',
      signature: 'a'.repeat(64),
      publicKey: 'pub_test_abc',
      checkoutUrl: expect.stringContaining('https://checkout.wompi.co/p/?'),
    });
  });

  it.each([
    [{ message: 'pago_pendiente', details: 'tx-9' }, 'pending', 'tx-9'],
    [{ message: 'wompi_no_disponible', details: null }, 'unavailable', undefined],
    [{ message: 'valor_invalido', details: null }, 'invalid', undefined],
    [{ message: 'concepto_invalido', details: null }, 'invalid', undefined],
    [{ message: 'TypeError: Failed to fetch', details: null }, 'failed', undefined],
  ])('traduce el error %j al código «%s»', async (error, code, transactionId) => {
    results.iniciar_pago = { data: null, error };

    const thrown = await supabasePayments
      .startPayment(user, { conceptId: 'administracion', amount: 1000 })
      .catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(PaymentError);
    expect(thrown).toMatchObject({ code, transactionId });
  });

  it('cancela el pago por su referencia con cancelar_pago()', async () => {
    await supabasePayments.cancelPayment(user, 'CNV-56-20261005103000-A1B2C3');

    expect(mockRpc).toHaveBeenCalledWith('cancelar_pago', { p_referencia: 'CNV-56-20261005103000-A1B2C3' });
  });
});

describe('Pagos con Supabase · integración con Wompi (RF15)', () => {
  it('arma la URL del Web Checkout con los datos que generó el servidor', () => {
    const url = buildCheckoutUrl({
      reference: 'CNV-56-20261006103000-A1B2C3',
      amountInCents: 3500000,
      currency: 'COP',
      signature: 'f'.repeat(64),
      publicKey: 'pub_test_abc',
    });

    expect(url).toBe(
      'https://checkout.wompi.co/p/?public-key=pub_test_abc&currency=COP&amount-in-cents=3500000' +
        `&reference=CNV-56-20261006103000-A1B2C3&signature:integrity=${'f'.repeat(64)}`,
    );
  });

  it('consulta el estado con la Edge Function wompi-estado', async () => {
    invokeResult = {
      data: { estado: 'APROBADA', enWompi: true, wompiId: '1234-1610641025-49201', medio: 'NEQUI' },
      error: null,
    };

    const status = await supabasePayments.checkPaymentStatus(user, 'CNV-56-1');

    expect(mockInvoke).toHaveBeenCalledWith('wompi-estado', { body: { referencia: 'CNV-56-1' } });
    expect(status).toEqual({ inWompi: true, status: 'APROBADA', method: 'NEQUI', wompiId: '1234-1610641025-49201' });
  });

  it('informa cuando Wompi aún no tiene la transacción', async () => {
    invokeResult = { data: { estado: null, enWompi: false }, error: null };

    expect(await supabasePayments.checkPaymentStatus(user, 'CNV-56-1')).toEqual({
      inWompi: false,
      status: null,
      method: undefined,
      wompiId: undefined,
    });
  });

  it('propaga el error si la función no responde', async () => {
    const error = new Error('FunctionsFetchError');
    invokeResult = { data: null, error };

    await expect(supabasePayments.checkPaymentStatus(user, 'CNV-56-1')).rejects.toBe(error);
  });
});

describe('Pagos con Supabase · resultado del pago (RF13)', () => {
  it('lee el pago de transacciones_pago con el nombre del concepto', async () => {
    tableResult = {
      data: {
        referencia: 'CNV-56-1',
        estado: 'APROBADA',
        concepto_id: 'administracion',
        descripcion: null,
        monto: '20000.00',
        medio_pago: 'NEQUI',
        wompi_id: '12211851-1791244176-40978',
        created_at: '2026-10-05T23:49:00Z',
        conceptos_pago: { nombre: 'Cuota administración' },
      },
      error: null,
    };

    const result = await supabasePayments.getPaymentResult(user, 'CNV-56-1');

    expect(mockFrom).toHaveBeenCalledWith('transacciones_pago');
    expect(mockEq).toHaveBeenCalledWith('referencia', 'CNV-56-1');
    expect(result).toEqual({
      reference: 'CNV-56-1',
      status: 'APROBADA',
      conceptId: 'administracion',
      conceptName: 'Cuota administración',
      description: null,
      amount: 20000,
      method: 'NEQUI',
      wompiId: '12211851-1791244176-40978',
      date: '2026-10-05T23:49:00Z',
    });
  });

  it('devuelve null si el pago no existe o no es de la unidad (RLS)', async () => {
    tableResult = { data: null, error: null };

    expect(await supabasePayments.getPaymentResult(user, 'CNV-OTRA')).toBeNull();
  });

  it('propaga el error de la base de datos', async () => {
    const error = new Error('permission denied');
    tableResult = { data: null, error };

    await expect(supabasePayments.getPaymentResult(user, 'CNV-56-1')).rejects.toBe(error);
  });
});

describe('Pagos con Supabase · historial de pagos (RF02)', () => {
  it('pide a mi_historial_pagos() el periodo y convierte las filas', async () => {
    results.mi_historial_pagos = {
      data: [
        {
          referencia: 'CNV-56-2',
          concepto_id: 'otros',
          concepto: 'Otros conceptos',
          descripcion: 'Parqueadero',
          monto: '15000.00',
          medio_pago: 'CARD',
          wompi_id: 'w-2',
          fecha: '2026-09-20T14:00:00Z',
        },
        {
          referencia: 'CNV-56-1',
          concepto_id: 'administracion',
          concepto: 'Cuota administración',
          descripcion: null,
          monto: 35000,
          medio_pago: null,
          wompi_id: null,
          fecha: '2026-09-05T15:00:00Z',
        },
      ],
      error: null,
    };

    const history = await supabasePayments.getPaymentHistory(user, { from: '2025-10-08', to: '2026-10-08' });

    // Solo el periodo: la unidad la toma el servidor de la sesión, nunca de la app.
    expect(mockRpc).toHaveBeenCalledWith('mi_historial_pagos', { p_desde: '2025-10-08', p_hasta: '2026-10-08' });
    expect(history).toEqual([
      {
        reference: 'CNV-56-2',
        status: 'APROBADA',
        conceptId: 'otros',
        conceptName: 'Otros conceptos',
        description: 'Parqueadero',
        amount: 15000,
        method: 'CARD',
        wompiId: 'w-2',
        date: '2026-09-20T14:00:00Z',
      },
      {
        reference: 'CNV-56-1',
        status: 'APROBADA',
        conceptId: 'administracion',
        conceptName: 'Cuota administración',
        description: null,
        amount: 35000,
        method: null,
        wompiId: null,
        date: '2026-09-05T15:00:00Z',
      },
    ]);
  });

  it('sin pagos devuelve una lista vacía', async () => {
    results.mi_historial_pagos = { data: [], error: null };
    expect(await supabasePayments.getPaymentHistory(user, { from: '2026-01-01', to: '2026-01-31' })).toEqual([]);
  });

  it('propaga el error de la base de datos', async () => {
    const error = new Error('rango_invalido');
    results.mi_historial_pagos = { data: null, error };

    await expect(supabasePayments.getPaymentHistory(user, { from: '2026-02-01', to: '2026-01-01' })).rejects.toBe(error);
  });
});
