import { paymentsBackend as supabasePayments } from '@/services/payments.supabase';

// Cliente de Supabase simulado: se verifica cómo el servicio traduce la respuesta de
// mi_estado_cuenta() al contrato de la app, sin conectarse a un proyecto real.
let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
const mockRpc = jest.fn(async (_name: string) => rpcResult);

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Pagos con Supabase', () => {
  it('convierte las filas de mi_estado_cuenta() en el estado de la cuenta', async () => {
    rpcResult = {
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
    rpcResult = { data: null, error };

    await expect(supabasePayments.getAccountStatus()).rejects.toBe(error);
  });
});
