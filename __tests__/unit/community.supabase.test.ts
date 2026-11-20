import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { communityBackend as supabaseCommunity } from '@/services/community.supabase';
import type { PersonInput } from '@/services/community.types';

// Cliente de Supabase simulado: se verifica cómo el servicio llama a las funciones de la base de
// datos (supabase/migrations/20261120000000_usuarios_unidades.sql) y traduce sus respuestas y
// errores al contrato de la app.
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

const unitRow = { id: 'unidad-1', nombre: 'Torre 2 · 301', direccion: 'Apartamento 301', personas: 2 };
const unit = { id: 'unidad-1', name: 'Torre 2 · 301', address: 'Apartamento 301', people: 2 };

const personRow = {
  id: 'perfil-1',
  nombre: 'Sofía Ramírez',
  email: 'sofia@correo.com',
  telefono: '3201112233',
  rol: 'residente',
  unidad_id: 'unidad-1',
  unidad: 'Torre 2 · 301',
  tiene_cuenta: false,
};
const person = {
  id: 'perfil-1',
  name: 'Sofía Ramírez',
  email: 'sofia@correo.com',
  phone: '3201112233',
  role: 'residente',
  unitId: 'unidad-1',
  unit: 'Torre 2 · 301',
  hasAccount: false,
};

const input: PersonInput = {
  name: '  Sofía   Ramírez ',
  email: ' Sofia@Correo.com ',
  phone: '320 111 2233',
  role: 'residente',
  unitId: 'unidad-1',
};
const params = {
  p_email: 'sofia@correo.com',
  p_nombre: 'Sofía Ramírez',
  p_rol: 'residente',
  p_unidad_id: 'unidad-1',
  p_telefono: '3201112233',
};

beforeEach(() => {
  rpcResults = {};
  mockRpc.mockClear();
});

describe('RF20 · usuarios y unidades con Supabase', () => {
  it('lista y guarda unidades con unidades_admin() y guardar_unidad()', async () => {
    rpcResults.unidades_admin = { data: [unitRow], error: null };
    expect(await supabaseCommunity.listUnits(admin)).toEqual([unit]);

    rpcResults.guardar_unidad = { data: [unitRow], error: null };
    expect(await supabaseCommunity.saveUnit(null, { name: ' Torre 2 ·  301 ', address: ' ' }, admin)).toEqual(unit);
    expect(mockRpc).toHaveBeenLastCalledWith('guardar_unidad', { p_id: null, p_nombre: 'Torre 2 · 301', p_direccion: null });

    await supabaseCommunity.saveUnit('unidad-1', { name: '301', address: 'Apto 301' }, admin);
    expect(mockRpc).toHaveBeenLastCalledWith('guardar_unidad', { p_id: 'unidad-1', p_nombre: '301', p_direccion: 'Apto 301' });
  });

  it('lista, pre-registra, edita y elimina personas', async () => {
    rpcResults.usuarios_conjunto = { data: [personRow], error: null };
    expect(await supabaseCommunity.listPeople(admin)).toEqual([person]);

    rpcResults.preregistrar_usuario = { data: [personRow], error: null };
    expect(await supabaseCommunity.preregisterPerson(input, admin)).toEqual(person);
    expect(mockRpc).toHaveBeenLastCalledWith('preregistrar_usuario', params);

    rpcResults.editar_usuario = { data: [personRow], error: null };
    await supabaseCommunity.updatePerson('perfil-1', input, admin);
    expect(mockRpc).toHaveBeenLastCalledWith('editar_usuario', { p_id: 'perfil-1', ...params });

    await supabaseCommunity.deletePreregistration('perfil-1', admin);
    expect(mockRpc).toHaveBeenLastCalledWith('eliminar_preregistro', { p_id: 'perfil-1' });
  });

  it('no llama al servidor si los datos son inválidos', async () => {
    await expect(supabaseCommunity.preregisterPerson({ ...input, email: 'sin-arroba' }, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { email: MSG.RF20.emailInvalid },
    });
    await expect(supabaseCommunity.saveUnit(null, { name: '', address: '' }, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { name: MSG.RF20.unitNameInvalid },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['correo_duplicado', { email: MSG.RF20.emailDuplicate }],
    ['correo_bloqueado', { email: MSG.RF20.emailLocked }],
    ['rol_propio', { role: MSG.RF20.ownRole }],
    ['ultimo_administrador', { role: MSG.RF20.lastAdmin }],
    ['unidad_requerida', { unitId: MSG.RF20.unitRequired }],
    ['nombre_invalido', { name: MSG.RF20.personNameInvalid }],
    ['telefono_invalido', { phone: MSG.RF16.phoneInvalid }],
  ])('traduce el error %s de la persona', async (message, fieldErrors) => {
    rpcResults.editar_usuario = { data: null, error: { message } };
    await expect(supabaseCommunity.updatePerson('perfil-1', input, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors,
    });
  });

  it('traduce los errores de la unidad y los de permisos', async () => {
    rpcResults.guardar_unidad = { data: null, error: { message: 'unidad_duplicada' } };
    await expect(supabaseCommunity.saveUnit(null, { name: '56', address: '' }, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { name: MSG.RF20.unitDuplicate },
    });

    rpcResults.unidades_admin = { data: null, error: { message: 'sin_permiso' } };
    await expect(supabaseCommunity.listUnits(admin)).rejects.toMatchObject({ code: 'forbidden' });

    rpcResults.eliminar_preregistro = { data: null, error: { message: 'usuario_con_cuenta' } };
    await expect(supabaseCommunity.deletePreregistration('perfil-1', admin)).rejects.toMatchObject({ code: 'has_account' });

    rpcResults.editar_usuario = { data: null, error: { message: 'no_encontrada' } };
    await expect(supabaseCommunity.updatePerson('x', input, admin)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('deja pasar los errores que no son de RF20', async () => {
    const error = { message: 'Failed to fetch' };
    rpcResults.usuarios_conjunto = { data: null, error };
    await expect(supabaseCommunity.listPeople(admin)).rejects.toBe(error);
  });
});
