import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import {
  deletePreregistration,
  listPeople,
  listUnits,
  preregisterPerson,
  resetMockCommunityState,
  saveUnit,
  updatePerson,
  validatePerson,
  validateUnit,
  type PersonInput,
} from '@/services/community.service';
import { mockNetwork } from '@/services/mockNetwork';

const admin: User = {
  id: 'u2',
  name: 'David Muñoz',
  initials: 'DM',
  email: 'admin@convive.com',
  phone: '',
  house: 'Administración',
  address: '',
  complex: '',
  role: 'administrador',
};

const valid: PersonInput = {
  name: '  Sofía   Ramírez ',
  email: ' Sofia.Ramirez@Correo.com ',
  phone: '320 111 2233',
  role: 'residente',
  unitId: 'unidad-78',
};

beforeEach(() => {
  jest.useFakeTimers();
  resetMockCommunityState();
  mockNetwork.delayMs = 0;
});
afterEach(() => jest.useRealTimers());

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectError(promise: Promise<unknown>, code: string, fieldErrors = {}) {
  const assertion = expect(promise).rejects.toMatchObject({ code, fieldErrors });
  await jest.runAllTimersAsync();
  await assertion;
}

describe('RF20 · validaciones', () => {
  it('unidad: nombre de 1 a 40 caracteres y dirección opcional de hasta 120', () => {
    expect(validateUnit({ name: '56', address: '' })).toEqual({});
    expect(validateUnit({ name: 'Torre 2 · 301', address: 'a'.repeat(120) })).toEqual({});
    expect(validateUnit({ name: '   ', address: '' })).toEqual({ name: MSG.RF20.unitNameInvalid });
    expect(validateUnit({ name: 'a'.repeat(41), address: '' })).toEqual({ name: MSG.RF20.unitNameInvalid });
    expect(validateUnit({ name: '56', address: 'a'.repeat(121) })).toEqual({ address: MSG.RF20.unitAddressInvalid });
  });

  it('persona: nombre, correo y rol obligatorios; teléfono opcional de 10 dígitos que empiece por 3', () => {
    expect(validatePerson(valid)).toEqual({});
    expect(validatePerson({ ...valid, phone: '' })).toEqual({});
    expect(validatePerson({ name: 'Lu', email: 'sin-arroba', phone: '123', role: null, unitId: null })).toEqual({
      name: MSG.RF20.personNameInvalid,
      email: MSG.RF20.emailInvalid,
      phone: MSG.RF16.phoneInvalid,
      role: MSG.RF20.roleRequired,
    });
  });

  it('la unidad es obligatoria para residentes y junta directiva, no para administración ni vigilancia', () => {
    expect(validatePerson({ ...valid, unitId: null })).toEqual({ unitId: MSG.RF20.unitRequired });
    expect(validatePerson({ ...valid, role: 'junta_directiva', unitId: null })).toEqual({ unitId: MSG.RF20.unitRequired });
    expect(validatePerson({ ...valid, role: 'vigilancia', unitId: null })).toEqual({});
    expect(validatePerson({ ...valid, role: 'administrador', unitId: null })).toEqual({});
  });
});

describe('RF20 · unidades (servicio simulado)', () => {
  it('lista las unidades ordenadas por nombre, con cuántas personas tiene cada una', async () => {
    const units = await run(listUnits(admin));
    expect(units.map((unit) => [unit.name, unit.people])).toEqual([
      ['12', 1],
      ['56', 1],
      ['78', 1],
      ['Administración', 1],
      ['Portería', 1],
    ]);
  });

  it('crea y edita unidades sin espacios de sobra', async () => {
    const created = await run(saveUnit(null, { name: '  Torre 2 ·  301 ', address: '  Apartamento 301 ' }, admin));
    expect(created).toMatchObject({ name: 'Torre 2 · 301', address: 'Apartamento 301', people: 0 });

    const edited = await run(saveUnit(created.id, { name: 'Torre 2 · 302', address: '' }, admin));
    expect(edited).toMatchObject({ id: created.id, name: 'Torre 2 · 302', address: null });
  });

  it('no permite dos unidades con el mismo nombre (sin importar mayúsculas)', async () => {
    await expectError(saveUnit(null, { name: 'portería', address: '' }, admin), 'validation', { name: MSG.RF20.unitDuplicate });
    // Guardar la misma unidad con su propio nombre sí se puede.
    await run(saveUnit('unidad-56', { name: '56', address: 'Casa 56' }, admin));
    await expectError(saveUnit('no-existe', { name: '99', address: '' }, admin), 'not_found');
  });
});

describe('RF20 · personas (servicio simulado)', () => {
  it('lista a las personas por nombre e indica quién aún no crea su cuenta', async () => {
    const people = await run(listPeople(admin));
    expect(people.map((person) => person.name)).toEqual(['Carlos Rojas', 'David Muñoz', 'Jorge Pérez', 'Laura Gómez', 'Monica Galvis']);
    expect(people.find((person) => person.name === 'Laura Gómez')).toMatchObject({ hasAccount: false, unit: '78' });
    expect(people.find((person) => person.name === 'Monica Galvis')).toMatchObject({ hasAccount: true, unit: '56' });
  });

  it('pre-registra con el correo en minúsculas y sin cuenta todavía', async () => {
    const person = await run(preregisterPerson(valid, admin));

    expect(person).toMatchObject({
      name: 'Sofía Ramírez',
      email: 'sofia.ramirez@correo.com',
      phone: '3201112233',
      role: 'residente',
      unit: '78',
      hasAccount: false,
    });
    expect((await run(listUnits(admin))).find((unit) => unit.name === '78')?.people).toBe(2);
  });

  it('no repite correos', async () => {
    await expectError(preregisterPerson({ ...valid, email: 'MONICA@gmail.com' }, admin), 'validation', {
      email: MSG.RF20.emailDuplicate,
    });
  });

  it('edita a una persona; el correo solo mientras no tenga cuenta', async () => {
    const laura = await run(updatePerson('u5', { ...valid, name: 'Laura Gómez', email: 'laura@correo.com', unitId: 'unidad-12' }, admin));
    expect(laura).toMatchObject({ email: 'laura@correo.com', unit: '12' });

    await expectError(updatePerson('u1', { ...valid, name: 'Monica Galvis', email: 'otro@correo.com', unitId: 'unidad-56' }, admin), 'validation', {
      email: MSG.RF20.emailLocked,
    });
    // Con su mismo correo sí se le pueden cambiar los demás datos.
    const monica = await run(updatePerson('u1', { ...valid, name: 'Mónica Galvis', email: 'monica@gmail.com', unitId: 'unidad-56' }, admin));
    expect(monica).toMatchObject({ name: 'Mónica Galvis', hasAccount: true });
  });

  it('cambia el rol de otra persona, pero no el propio', async () => {
    const carlos = await run(updatePerson('u3', { ...valid, name: 'Carlos Rojas', email: 'junta@convive.com', role: 'administrador', unitId: null }, admin));
    expect(carlos.role).toBe('administrador');

    await expectError(updatePerson('u2', { ...valid, name: 'David Muñoz', email: 'admin@convive.com', role: 'residente', unitId: 'unidad-56' }, admin), 'validation', {
      role: MSG.RF20.ownRole,
    });
  });

  it('el conjunto no se queda sin administrador', async () => {
    // Un segundo administrador intenta quitarle el rol al único administrador (David).
    const otherAdmin = { ...admin, id: 'u9' };
    await expectError(updatePerson('u2', { ...valid, name: 'David Muñoz', email: 'admin@convive.com', role: 'residente', unitId: 'unidad-56' }, otherAdmin), 'validation', {
      role: MSG.RF20.lastAdmin,
    });
  });

  it('elimina un pre-registro, pero no a quien ya creó su cuenta', async () => {
    await run(deletePreregistration('u5', admin));
    expect((await run(listPeople(admin))).map((person) => person.id)).not.toContain('u5');

    await expectError(deletePreregistration('u1', admin), 'has_account');
    await expectError(deletePreregistration('no-existe', admin), 'not_found');
  });

  it.each(['residente', 'junta_directiva', 'vigilancia'] as const)('%s no puede administrar usuarios ni unidades', async (role) => {
    const user = { ...admin, role };
    await expectError(listUnits(user), 'forbidden');
    await expectError(saveUnit(null, { name: '99', address: '' }, user), 'forbidden');
    await expectError(listPeople(user), 'forbidden');
    await expectError(preregisterPerson(valid, user), 'forbidden');
    await expectError(updatePerson('u5', valid, user), 'forbidden');
    await expectError(deletePreregistration('u5', user), 'forbidden');
  });
});
