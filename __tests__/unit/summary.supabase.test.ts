import type { User } from '@/services/auth.types';
import { summaryBackend as supabaseSummary } from '@/services/summary.supabase';

// Cliente de Supabase simulado: se verifica cómo el servicio llama a las funciones de
// 20261126000000_resumen_general.sql y traduce sus respuestas y errores al contrato de la app.
type Result = { data: unknown; error: unknown };

let rpcResults: Record<string, Result> = {};

const mockRpc = jest.fn(async (name: string, _args?: unknown) => rpcResults[name] ?? { data: null, error: null });

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc }),
}));

const user = (role: User['role']): User => ({
  id: 'p1',
  name: 'Prueba',
  initials: 'PR',
  email: 'prueba@convive.com',
  phone: '',
  house: '56',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role,
});

// PostgREST devuelve los numeric como texto.
const row = {
  saldo_inicial: '2000000.00',
  saldo_actual: '3100000.00',
  ingresos: '1000000.00',
  egresos: '400000.00',
  mensual: [{ mes: '2026-09', ingresos: '1000000.00', egresos: '400000.00' }],
  gastos_por_categoria: [
    { categoria: 'Nómina', total: '300000.00' },
    { categoria: 'Aseo', total: '100000.00' },
  ],
  pqrs_por_tipo: [{ tipo: 'queja', cantidad: 2 }],
  pqrs_por_estado: [
    { estado: 'pendiente', cantidad: 1 },
    { estado: 'resuelto', cantidad: 1 },
  ],
  reservas_por_zona: [{ zona: 'Cancha', cantidad: 2 }],
};

// «Hoy» fijo para que el rango de las pruebas no quede en el futuro ni en el pasado lejano.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 20, 10, 30));
  rpcResults = {};
});
afterEach(() => jest.useRealTimers());

const september = { from: '2026-09-01', to: '2026-09-20' };

describe('Resumen de General con Supabase', () => {
  it('llama a resumen_general con el rango y convierte los totales a números', async () => {
    rpcResults.resumen_general = { data: row, error: null };

    const summary = await supabaseSummary.getSummary(september, user('residente'));

    expect(mockRpc).toHaveBeenCalledWith('resumen_general', { p_desde: '2026-09-01', p_hasta: '2026-09-20' });
    expect(summary).toEqual({
      initialBalance: 2_000_000,
      balance: 3_100_000,
      income: 1_000_000,
      expenses: 400_000,
      monthly: [{ month: '2026-09', income: 1_000_000, expenses: 400_000 }],
      expenseCategories: [
        { name: 'Nómina', total: 300_000 },
        { name: 'Aseo', total: 100_000 },
      ],
      pqrsByType: [{ type: 'queja', count: 2 }],
      pqrsByStatus: [
        { status: 'pendiente', count: 1 },
        { status: 'resuelto', count: 1 },
      ],
      reservationsByZone: [{ zone: 'Cancha', count: 2 }],
    });
  });

  it('no llama al servidor si el rol no ve General o si el rango no es válido', async () => {
    await expect(supabaseSummary.getSummary(september, user('vigilancia'))).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      supabaseSummary.getSummary({ from: '2026-09-20', to: '2026-09-01' }, user('administrador')),
    ).rejects.toMatchObject({ code: 'invalid_range' });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['sin_permiso', 'forbidden'],
    ['rango_invalido', 'invalid_range'],
    ['otra cosa', 'failed'],
  ])('traduce el error %s del servidor', async (message, code) => {
    rpcResults.resumen_general = { data: null, error: { message } };

    await expect(supabaseSummary.getSummary(september, user('junta_directiva'))).rejects.toMatchObject({ code });
  });

  it('consulta y cambia el saldo inicial como administrador', async () => {
    rpcResults.saldo_inicial_conjunto = { data: '1500000.00', error: null };
    rpcResults.configurar_saldo_inicial = { data: '2000000.00', error: null };

    expect(await supabaseSummary.getInitialBalance(user('administrador'))).toBe(1_500_000);
    expect(await supabaseSummary.setInitialBalance(2_000_000, user('administrador'))).toBe(2_000_000);
    expect(mockRpc).toHaveBeenCalledWith('configurar_saldo_inicial', { p_monto: 2_000_000 });
  });

  it('no envía un saldo inicial inválido ni de otro rol', async () => {
    await expect(supabaseSummary.setInitialBalance(-5, user('administrador'))).rejects.toMatchObject({
      code: 'invalid_amount',
    });
    await expect(supabaseSummary.setInitialBalance(5, user('junta_directiva'))).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('traduce monto_invalido del servidor', async () => {
    rpcResults.configurar_saldo_inicial = { data: null, error: { message: 'monto_invalido' } };

    await expect(supabaseSummary.setInitialBalance(5, user('administrador'))).rejects.toMatchObject({
      code: 'invalid_amount',
    });
  });
});
