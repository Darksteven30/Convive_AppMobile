import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { ATTACHMENTS_BUCKET, financeBackend as supabaseFinance } from '@/services/finance.supabase';
import { ALL_CATEGORIES, type MovementInput } from '@/services/finance.types';

// Cliente de Supabase simulado: se verifica cómo el servicio traduce las respuestas y los errores
// de la base de datos (supabase/migrations/20261012000000_finanzas.sql) al contrato de la app.
type Result = { data: unknown; error: unknown };

let rpcResults: Record<string, Result> = {};
let tableResults: Record<string, Result> = {};

const single = (result: Result) => ({
  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
  error: result.error,
});

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  const result = rpcResults[name] ?? { data: null, error: null };
  // Como supabase-js: la llamada se puede esperar directamente o con .maybeSingle().
  return Object.assign(Promise.resolve(result), { maybeSingle: async () => single(result) });
});

// Tablas: from → select → eq… → await / maybeSingle.
const mockEq = jest.fn();
const mockFrom = jest.fn((table: string) => {
  const result = tableResults[table] ?? { data: [], error: null };
  const query = {
    select: (_columns: string) => query,
    eq: (column: string, value: unknown) => {
      mockEq(table, column, value);
      return query;
    },
    maybeSingle: async () => single(result),
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
});

const mockUpload = jest.fn(async (_path: string, _body: ArrayBuffer, _options?: unknown) => ({ data: {}, error: null as unknown }));
const mockRemove = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));
const mockStorageFrom = jest.fn((_bucket: string) => ({ upload: mockUpload, remove: mockRemove }));

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc, from: mockFrom, storage: { from: mockStorageFrom } }),
}));

// El archivo elegido en el celular se lee con expo-file-system (3 bytes de prueba).
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })),
}));

const admin: User = {
  id: 'p-admin',
  name: 'David Muñoz',
  initials: 'DM',
  email: 'admin@convive.com',
  phone: '',
  house: 'Administración',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role: 'administrador',
};

const valid: MovementInput = {
  type: 'egreso',
  categoryId: 'egr-aseo',
  amount: 350000,
  date: '2026-10-01',
  description: '  Compra de insumos de aseo  ',
};

const created = {
  id: 'mov-1',
  categoria: 'Aseo',
  registrado_por_id: 'p-admin',
  registrado_por: 'David Muñoz',
  created_at: '2026-10-01T15:00:00+00:00',
};

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'mov-1',
  tipo: 'ingreso',
  categoria_id: 'ing-admin',
  categoria: 'Cuotas de administración',
  monto: '8250000.00',
  fecha: '2026-07-05',
  descripcion: 'Recaudo cuotas de administración julio',
  soporte_ruta: null,
  soporte_nombre: null,
  soporte_tipo: null,
  soporte_bytes: null,
  registrado_por_id: 'p-admin',
  registrado_por: 'David Muñoz',
  created_at: '2026-07-05T14:00:00+00:00',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  rpcResults = {};
  tableResults = {};
});

describe('Finanzas con Supabase · categorías', () => {
  it('RF03: pide las categorías activas del tipo elegido y las ordena alfabéticamente', async () => {
    tableResults.categorias_financieras = {
      data: [
        { id: 'egr-otros', nombre: 'Otros egresos', tipo: 'egreso', activa: true },
        { id: 'egr-aseo', nombre: 'Aseo', tipo: 'egreso', activa: true },
        { id: 'egr-nomina', nombre: 'Nómina', tipo: 'egreso', activa: true },
      ],
      error: null,
    };

    const categories = await supabaseFinance.listCategories('egreso');

    expect(mockFrom).toHaveBeenCalledWith('categorias_financieras');
    expect(mockEq).toHaveBeenCalledWith('categorias_financieras', 'tipo', 'egreso');
    expect(mockEq).toHaveBeenCalledWith('categorias_financieras', 'activa', true);
    expect(categories.map((category) => category.name)).toEqual(['Aseo', 'Nómina', 'Otros egresos']);
    expect(categories[0]).toEqual({ id: 'egr-aseo', name: 'Aseo', type: 'egreso', active: true });
  });

  it('RF04: el filtro de reportes incluye las inactivas, primero egresos y luego ingresos', async () => {
    tableResults.categorias_financieras = {
      data: [
        { id: 'ing-donaciones', nombre: 'Donaciones', tipo: 'ingreso', activa: false },
        { id: 'egr-nomina', nombre: 'Nómina', tipo: 'egreso', activa: true },
        { id: 'ing-admin', nombre: 'Cuotas de administración', tipo: 'ingreso', activa: true },
      ],
      error: null,
    };

    const categories = await supabaseFinance.listReportCategories();

    expect(categories.map((category) => category.id)).toEqual(['egr-nomina', 'ing-admin', 'ing-donaciones']);
  });
});

describe('Finanzas con Supabase · movimientos (RF03)', () => {
  it('convierte las filas de movimientos_financieros() en movimientos', async () => {
    rpcResults.movimientos_financieros = {
      data: [
        row(),
        row({
          id: 'mov-2',
          tipo: 'egreso',
          categoria_id: 'egr-aseo',
          categoria: 'Aseo',
          monto: 320000.5,
          soporte_ruta: 'conj-1/123-abc.pdf',
          soporte_nombre: 'factura.pdf',
          soporte_tipo: 'application/pdf',
          soporte_bytes: 2048,
        }),
      ],
      error: null,
    };

    const movements = await supabaseFinance.listMovements();

    expect(mockRpc).toHaveBeenCalledWith('movimientos_financieros');
    expect(movements[0]).toEqual({
      id: 'mov-1',
      type: 'ingreso',
      categoryId: 'ing-admin',
      categoryName: 'Cuotas de administración',
      amount: 8250000,
      date: '2026-07-05',
      description: 'Recaudo cuotas de administración julio',
      attachment: null,
      createdBy: { id: 'p-admin', name: 'David Muñoz' },
      createdAt: '2026-07-05T14:00:00+00:00',
    });
    expect(movements[1].amount).toBe(320000.5);
    expect(movements[1].attachment).toEqual({
      uri: '',
      storagePath: 'conj-1/123-abc.pdf',
      name: 'factura.pdf',
      mimeType: 'application/pdf',
      size: 2048,
    });
  });

  it('propaga el error de la base de datos', async () => {
    const error = new Error('permission denied');
    rpcResults.movimientos_financieros = { data: null, error };

    await expect(supabaseFinance.listMovements()).rejects.toBe(error);
  });

  it('registra el movimiento con registrar_movimiento() y devuelve la auditoría del servidor', async () => {
    rpcResults.registrar_movimiento = { data: [created], error: null };

    const movement = await supabaseFinance.createMovement(valid, admin);

    expect(mockRpc).toHaveBeenCalledWith('registrar_movimiento', {
      p_tipo: 'egreso',
      p_categoria_id: 'egr-aseo',
      p_monto: 350000,
      p_fecha: '2026-10-01',
      p_descripcion: 'Compra de insumos de aseo',
      p_soporte_ruta: null,
      p_soporte_nombre: null,
      p_soporte_tipo: null,
      p_soporte_bytes: null,
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(movement).toEqual({
      ...valid,
      description: 'Compra de insumos de aseo',
      id: 'mov-1',
      categoryName: 'Aseo',
      attachment: null,
      createdBy: { id: 'p-admin', name: 'David Muñoz' },
      createdAt: '2026-10-01T15:00:00+00:00',
    });
  });

  it('sube el soporte a la carpeta del conjunto antes de registrar el movimiento', async () => {
    rpcResults.mi_conjunto = { data: 'conj-1', error: null };
    rpcResults.registrar_movimiento = { data: [created], error: null };

    const movement = await supabaseFinance.createMovement(
      { ...valid, attachment: { uri: 'file:///cache/factura.pdf', name: 'factura.pdf', mimeType: 'APPLICATION/PDF' } },
      admin,
    );

    expect(mockStorageFrom).toHaveBeenCalledWith(ATTACHMENTS_BUCKET);
    const [path, body, options] = mockUpload.mock.calls[0];
    expect(path).toMatch(/^conj-1\/\d+-[a-z0-9]+\.pdf$/);
    expect((body as ArrayBuffer).byteLength).toBe(3);
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });

    expect(mockRpc).toHaveBeenCalledWith(
      'registrar_movimiento',
      expect.objectContaining({
        p_soporte_ruta: path,
        p_soporte_nombre: 'factura.pdf',
        p_soporte_tipo: 'application/pdf',
        p_soporte_bytes: 3,
      }),
    );
    expect(movement.attachment).toEqual({
      uri: 'file:///cache/factura.pdf',
      name: 'factura.pdf',
      mimeType: 'application/pdf',
      size: 3,
      storagePath: path,
    });
  });

  it('si el servidor rechaza el movimiento, borra el soporte que acababa de subir', async () => {
    rpcResults.mi_conjunto = { data: 'conj-1', error: null };
    rpcResults.registrar_movimiento = { data: null, error: { message: 'fecha_futura' } };

    await expect(
      supabaseFinance.createMovement(
        { ...valid, attachment: { uri: 'file:///cache/foto.jpg', name: 'foto.jpg', mimeType: 'image/jpeg', size: 3 } },
        admin,
      ),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { date: MSG.RF03.futureDate } });

    const [path] = mockUpload.mock.calls[0];
    expect(mockRemove).toHaveBeenCalledWith([path]);
  });

  it.each([
    ['categoria_invalida', 'categoryId', MSG.RF03.categoryRequired],
    ['monto_invalido', 'amount', MSG.RF03.amountInvalid],
    ['descripcion_invalida', 'description', MSG.RF03.descriptionShort],
    ['soporte_invalido', 'attachment', MSG.RF03.invalidFile],
  ])('traduce el error %s al mensaje del campo', async (code, field, message) => {
    rpcResults.registrar_movimiento = { data: null, error: { message: code } };

    await expect(supabaseFinance.createMovement(valid, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { [field]: message },
    });
  });

  it('MSG-RF03-07: sin_permiso del servidor es un error de permisos', async () => {
    rpcResults.registrar_movimiento = { data: null, error: { message: 'sin_permiso' } };

    await expect(supabaseFinance.createMovement(valid, admin)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('MSG-RF03-07: otros roles ni siquiera llegan al servidor', async () => {
    await expect(supabaseFinance.createMovement(valid, { ...admin, role: 'junta_directiva' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('valida en la app antes de subir nada (monto y fecha)', async () => {
    await expect(
      supabaseFinance.createMovement({ ...valid, amount: 0, date: '2999-01-01' }, admin),
    ).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { amount: MSG.RF03.amountInvalid, date: MSG.RF03.futureDate },
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

describe('Finanzas con Supabase · reportes (RF04)', () => {
  const filters = { from: '2026-07-01', to: '2026-09-30', categoryId: ALL_CATEGORIES };

  it('consulta el periodo, ordena cronológicamente y calcula los totales', async () => {
    rpcResults.movimientos_financieros = {
      data: [
        row({ id: 'b', tipo: 'egreso', categoria: 'Nómina', monto: '3200000.00', fecha: '2026-07-30' }),
        row({ id: 'a', fecha: '2026-07-05' }),
      ],
      error: null,
    };

    const report = await supabaseFinance.getFinancialReport(filters, admin);

    expect(mockRpc).toHaveBeenCalledWith('movimientos_financieros', {
      p_desde: '2026-07-01',
      p_hasta: '2026-09-30',
      p_categoria_id: null,
    });
    expect(report.movements.map((movement) => movement.id)).toEqual(['a', 'b']);
    expect(report.totals).toEqual({ income: 8250000, expenses: 3200000, balance: 5050000 });
    expect(report.categoryName).toBe('Todas');
    expect(report.generatedBy).toEqual({ id: 'p-admin', name: 'David Muñoz' });
  });

  it('filtra por categoría y toma su nombre del catálogo aunque no haya movimientos', async () => {
    rpcResults.movimientos_financieros = { data: [], error: null };
    tableResults.categorias_financieras = { data: { nombre: 'Multas e intereses' }, error: null };

    const report = await supabaseFinance.getFinancialReport({ ...filters, categoryId: 'ing-multas' }, admin);

    expect(mockRpc).toHaveBeenCalledWith('movimientos_financieros', expect.objectContaining({ p_categoria_id: 'ing-multas' }));
    expect(mockEq).toHaveBeenCalledWith('categorias_financieras', 'id', 'ing-multas');
    expect(report.movements).toEqual([]);
    expect(report.categoryName).toBe('Multas e intereses');
  });

  it('la junta directiva consulta en solo lectura; residente y vigilancia no', async () => {
    rpcResults.movimientos_financieros = { data: [], error: null };
    await expect(supabaseFinance.getFinancialReport(filters, { ...admin, role: 'junta_directiva' })).resolves.toBeDefined();

    for (const role of ['residente', 'vigilancia'] as const) {
      await expect(supabaseFinance.getFinancialReport(filters, { ...admin, role })).rejects.toMatchObject({
        code: 'forbidden',
      });
    }
  });

  it('sin_permiso del servidor es un error de permisos', async () => {
    rpcResults.movimientos_financieros = { data: null, error: { message: 'sin_permiso' } };

    await expect(supabaseFinance.getFinancialReport(filters, admin)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('valida el rango en la app antes de consultar (MSG-RF04-02)', async () => {
    await expect(
      supabaseFinance.getFinancialReport({ ...filters, from: '2026-09-30', to: '2026-07-01' }, admin),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { from: MSG.RF04.startAfterEnd } });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
