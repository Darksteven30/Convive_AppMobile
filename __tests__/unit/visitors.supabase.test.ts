import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import type { EntryInput } from '@/services/visitors.types';
import { visitorsBackend as supabaseVisitors } from '@/services/visitors.supabase';

// Cliente de Supabase simulado: se verifica cómo el servicio llama a las funciones de la base de
// datos (supabase/migrations/20261030000000_visitantes.sql) y traduce sus respuestas y errores al
// contrato de la app.
type Result = { data: unknown; error: unknown };

let rpcResults: Record<string, Result> = {};

const single = (result: Result) => ({
  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
  error: result.error,
});

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  const result = rpcResults[name] ?? { data: null, error: null };
  // Como supabase-js: la llamada se puede esperar directamente o con .maybeSingle().
  return Object.assign(Promise.resolve(result), { maybeSingle: async () => single(result) });
});

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc }),
}));

const guard: User = {
  id: 'p-porteria',
  name: 'Jorge Pérez',
  initials: 'JP',
  email: 'vigilancia@convive.com',
  phone: '',
  house: 'Portería',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role: 'vigilancia',
};

const valid: EntryInput = {
  name: '  Luisa   Fernanda Ríos ',
  documentType: 'PASAPORTE',
  documentNumber: 'ab-123 456',
  unitId: 'unidad-56',
  plate: 'xyz 12a',
};

const row = {
  id: 'visita-1',
  nombre: 'Luisa Fernanda Ríos',
  tipo_documento: 'PASAPORTE',
  numero_documento: 'AB123456',
  unidad: '56',
  placa: 'XYZ12A',
  entrada: '2026-10-30T14:05:00+00:00',
  salida: null,
};

const visit = {
  id: 'visita-1',
  name: 'Luisa Fernanda Ríos',
  documentType: 'PASAPORTE',
  documentNumber: 'AB123456',
  unit: '56',
  plate: 'XYZ12A',
  enteredAt: '2026-10-30T14:05:00+00:00',
  exitedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  rpcResults = {};
});

describe('Visitantes con Supabase · consultar', () => {
  it('lista las unidades con unidades_visita()', async () => {
    rpcResults.unidades_visita = {
      data: [
        { id: 'u-12', nombre: '12', direccion: 'Casa # 12 Cali - Valle' },
        { id: 'u-56', nombre: '56', direccion: null },
      ],
      error: null,
    };

    const units = await supabaseVisitors.listUnits(guard);

    expect(mockRpc).toHaveBeenCalledWith('unidades_visita');
    expect(units).toEqual([
      { id: 'u-12', name: '12', address: 'Casa # 12 Cali - Valle' },
      { id: 'u-56', name: '56', address: null },
    ]);
  });

  it('busca el nombre para autocompletar con el documento normalizado', async () => {
    rpcResults.buscar_visitante = { data: 'Ana María Restrepo', error: null };

    const name = await supabaseVisitors.findVisitorName('CC', '1.012.345.678', guard);

    expect(mockRpc).toHaveBeenCalledWith('buscar_visitante', { p_tipo_documento: 'CC', p_numero_documento: '1012345678' });
    expect(name).toBe('Ana María Restrepo');
  });

  it('sin registros previos devuelve null', async () => {
    rpcResults.buscar_visitante = { data: null, error: null };
    expect(await supabaseVisitors.findVisitorName('CC', '99999999', guard)).toBeNull();
  });

  it('lista los visitantes dentro con visitantes_dentro()', async () => {
    rpcResults.visitantes_dentro = { data: [row], error: null };

    expect(await supabaseVisitors.listVisitorsInside(guard)).toEqual([visit]);
    expect(mockRpc).toHaveBeenCalledWith('visitantes_dentro');
  });

  it('sin el rol de vigilancia falla con forbidden', async () => {
    rpcResults.visitantes_dentro = { data: null, error: { message: 'sin_permiso' } };
    await expect(supabaseVisitors.listVisitorsInside(guard)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('Visitantes con Supabase · entrada', () => {
  it('envía los datos normalizados y no la hora: la pone el servidor', async () => {
    rpcResults.registrar_entrada_visitante = { data: [row], error: null };

    const result = await supabaseVisitors.registerEntry(valid, guard);

    expect(mockRpc).toHaveBeenCalledWith('registrar_entrada_visitante', {
      p_nombre: 'Luisa Fernanda Ríos',
      p_tipo_documento: 'PASAPORTE',
      p_numero_documento: 'AB123456',
      p_unidad_id: 'unidad-56',
      p_placa: 'XYZ12A',
    });
    expect(result).toEqual(visit);
  });

  it('sin placa la envía como null', async () => {
    rpcResults.registrar_entrada_visitante = { data: [{ ...row, placa: null }], error: null };

    await supabaseVisitors.registerEntry({ ...valid, plate: '' }, guard);

    expect(mockRpc).toHaveBeenCalledWith('registrar_entrada_visitante', expect.objectContaining({ p_placa: null }));
  });

  it('valida antes de llamar al servidor', async () => {
    await expect(supabaseVisitors.registerEntry({ ...valid, unitId: null }, guard)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { unitId: MSG.RF10.unitRequired },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['nombre_invalido', { name: MSG.RF10.nameInvalid }],
    ['documento_invalido', { documentNumber: MSG.RF10.documentInvalid }],
    ['ya_dentro', { documentNumber: MSG.RF10.alreadyInside }],
    ['unidad_invalida', { unitId: MSG.RF10.unitRequired }],
    ['placa_invalida', { plate: MSG.RF10.plateInvalid }],
  ])('traduce el error %s al mensaje del campo', async (code, fieldErrors) => {
    rpcResults.registrar_entrada_visitante = { data: null, error: { message: code } };

    await expect(supabaseVisitors.registerEntry(valid, guard)).rejects.toMatchObject({ code: 'validation', fieldErrors });
  });

  it('sin el rol de vigilancia falla con forbidden', async () => {
    rpcResults.registrar_entrada_visitante = { data: null, error: { message: 'sin_permiso' } };
    await expect(supabaseVisitors.registerEntry(valid, guard)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('otros errores se propagan tal cual', async () => {
    const error = { message: 'connection refused' };
    rpcResults.registrar_entrada_visitante = { data: null, error };
    await expect(supabaseVisitors.registerEntry(valid, guard)).rejects.toBe(error);
  });
});

describe('Visitantes con Supabase · salida', () => {
  it('registra la salida con registrar_salida_visitante()', async () => {
    rpcResults.registrar_salida_visitante = { data: [{ ...row, salida: '2026-10-30T16:45:00+00:00' }], error: null };

    const result = await supabaseVisitors.registerExit('visita-1', guard);

    expect(mockRpc).toHaveBeenCalledWith('registrar_salida_visitante', { p_id: 'visita-1' });
    expect(result).toEqual({ ...visit, exitedAt: '2026-10-30T16:45:00+00:00' });
  });

  it('sin entrada activa falla con no_active_entry (MSG-RF10-03)', async () => {
    rpcResults.registrar_salida_visitante = { data: null, error: { message: 'sin_entrada_activa' } };
    await expect(supabaseVisitors.registerExit('visita-1', guard)).rejects.toMatchObject({ code: 'no_active_entry' });
  });
});
