import { PaymentError } from '@/services/payments.types';
import { paymentsBackend as supabasePayments } from '@/services/payments.supabase';

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

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc }),
}));

const user = {
  id: 'p1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
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
