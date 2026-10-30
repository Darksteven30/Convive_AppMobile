import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { mockNetwork } from '@/services/mockNetwork';
import {
  MOCK_UNITS,
  findVisitorName,
  isValidDocument,
  isValidName,
  isValidPlate,
  listUnits,
  listVisitorsInside,
  normalizeName,
  registerEntry,
  registerExit,
  resetMockVisitorsState,
  validateEntry,
  type EntryInput,
} from '@/services/visitors.service';

const guard: User = {
  id: 'u4',
  name: 'Jorge Pérez',
  initials: 'JP',
  email: 'vigilancia@convive.com',
  phone: '',
  house: 'Portería',
  address: '',
  complex: '',
  role: 'vigilancia',
};

const valid: EntryInput = {
  name: '  Luisa   Fernanda Ríos ',
  documentType: 'CC',
  documentNumber: '1144556677',
  unitId: 'unidad-56',
  plate: 'xyz12a',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-30T14:05:00.000Z'));
  resetMockVisitorsState();
  // Sin latencia simulada, la hora del «servidor» es exactamente la fijada.
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

describe('RF10 · validaciones', () => {
  it('nombre completo de 3 a 80 caracteres, solo letras (con tildes y ñ) y espacios', () => {
    expect(isValidName('Ana')).toBe(true);
    expect(isValidName('José Muñoz Úsuga')).toBe(true);
    expect(isValidName('a'.repeat(80))).toBe(true);
    expect(isValidName('  Lu  ')).toBe(false);
    expect(isValidName('a'.repeat(81))).toBe(false);
    expect(isValidName('Ana2')).toBe(false);
    expect(isValidName('Ana-María')).toBe(false);
    expect(isValidName('')).toBe(false);
    expect(normalizeName('  Ana   María  ')).toBe('Ana María');
  });

  it('CC, CE y TI: solo números de 5 a 12 dígitos', () => {
    for (const type of ['CC', 'CE', 'TI'] as const) {
      expect(isValidDocument(type, '12345')).toBe(true);
      expect(isValidDocument(type, '123456789012')).toBe(true);
      expect(isValidDocument(type, '1234')).toBe(false);
      expect(isValidDocument(type, '1234567890123')).toBe(false);
      expect(isValidDocument(type, 'AB12345')).toBe(false);
    }
    // Los puntos y espacios se ignoran: «1.012.345.678».
    expect(isValidDocument('CC', '1.012.345.678')).toBe(true);
  });

  it('pasaporte: 5 a 15 letras o números', () => {
    expect(isValidDocument('PASAPORTE', 'ab12345')).toBe(true);
    expect(isValidDocument('PASAPORTE', 'A'.repeat(15))).toBe(true);
    expect(isValidDocument('PASAPORTE', 'AB12')).toBe(false);
    expect(isValidDocument('PASAPORTE', 'A'.repeat(16))).toBe(false);
    expect(isValidDocument('PASAPORTE', 'AB#1234')).toBe(false);
  });

  it('placa de carro AAA123 o de moto AAA12A, sin importar mayúsculas', () => {
    expect(isValidPlate('ABC123')).toBe(true);
    expect(isValidPlate('abc12d')).toBe(true);
    expect(isValidPlate('ABC 123')).toBe(true);
    expect(isValidPlate('AB1234')).toBe(false);
    expect(isValidPlate('ABC1234')).toBe(false);
    expect(isValidPlate('ABC1D2')).toBe(false);
    expect(isValidPlate('123ABC')).toBe(false);
  });

  it('nombre y unidad obligatorios; la placa es opcional (MSG-RF10-04/05/06)', () => {
    expect(validateEntry(valid)).toEqual({});
    expect(validateEntry({ ...valid, plate: '' })).toEqual({});
    expect(validateEntry({ documentType: 'CC' })).toEqual({
      name: MSG.RF10.nameInvalid,
      documentNumber: MSG.RF10.documentInvalid,
      unitId: MSG.RF10.unitRequired,
    });
    expect(validateEntry({ ...valid, plate: 'AB123' })).toEqual({ plate: MSG.RF10.plateInvalid });
    expect(validateEntry({ ...valid, documentType: 'PASAPORTE', documentNumber: 'AB#12' })).toEqual({
      documentNumber: MSG.RF10.documentInvalid,
    });
  });
});

describe('RF10 · servicio simulado', () => {
  it('lista las unidades del conjunto para el selector', async () => {
    const units = await run(listUnits(guard));
    expect(units).toEqual(MOCK_UNITS);
    expect(units.map((unit) => unit.name)).toEqual(['12', '56', '78', 'Administración', 'Portería']);
  });

  it('autocompleta con el nombre del último registro del documento', async () => {
    expect(await run(findVisitorName('CC', '1012345678', guard))).toBe('Ana María Restrepo');
    expect(await run(findVisitorName('CC', '1.012.345.678', guard))).toBe('Ana María Restrepo');
    // Mismo número con otro tipo de documento: es otra persona.
    expect(await run(findVisitorName('CE', '1012345678', guard))).toBeNull();
    expect(await run(findVisitorName('CC', '99999999', guard))).toBeNull();
  });

  it('registra la entrada con la hora del servidor y la deja en «Visitantes dentro»', async () => {
    const visit = await run(registerEntry(valid, guard));

    expect(visit).toMatchObject({
      name: 'Luisa Fernanda Ríos',
      documentType: 'CC',
      documentNumber: '1144556677',
      unit: '56',
      plate: 'XYZ12A',
      enteredAt: '2026-10-30T14:05:00.000Z',
      exitedAt: null,
    });
    const inside = await run(listVisitorsInside(guard));
    expect(inside.map((item) => item.name)).toEqual(['Luisa Fernanda Ríos', 'Carlos Mejía']);
    expect(await run(findVisitorName('CC', '1144556677', guard))).toBe('Luisa Fernanda Ríos');
  });

  it('sin placa la guarda vacía', async () => {
    const visit = await run(registerEntry({ ...valid, plate: '  ' }, guard));
    expect(visit.plate).toBeNull();
  });

  it('rechaza los datos inválidos como el servidor', async () => {
    await expectError(registerEntry({ ...valid, unitId: null }, guard), 'validation', { unitId: MSG.RF10.unitRequired });
    await expectError(registerEntry({ ...valid, unitId: 'otra' }, guard), 'validation', { unitId: MSG.RF10.unitRequired });
    await expectError(registerEntry({ ...valid, plate: '12ABC3' }, guard), 'validation', { plate: MSG.RF10.plateInvalid });
  });

  it('no deja registrar otra entrada de un visitante que sigue dentro', async () => {
    await expectError(
      registerEntry({ ...valid, name: 'Carlos Mejía', documentNumber: '79876543' }, guard),
      'validation',
      { documentNumber: MSG.RF10.alreadyInside },
    );
  });

  it('registra la salida con la hora del servidor y lo quita de «Visitantes dentro»', async () => {
    jest.setSystemTime(new Date('2026-10-30T16:45:00.000Z'));
    const visit = await run(registerExit('v-2', guard));

    expect(visit).toMatchObject({ name: 'Carlos Mejía', exitedAt: '2026-10-30T16:45:00.000Z' });
    expect(await run(listVisitorsInside(guard))).toEqual([]);
    // Ya salió: puede volver a entrar.
    await run(registerEntry({ ...valid, name: 'Carlos Mejía', documentNumber: '79876543' }, guard));
  });

  it('no registra la salida sin una entrada activa (MSG-RF10-03)', async () => {
    await expectError(registerExit('v-1', guard), 'no_active_entry');
    await expectError(registerExit('no-existe', guard), 'no_active_entry');
    await run(registerExit('v-2', guard));
    await expectError(registerExit('v-2', guard), 'no_active_entry');
  });

  it.each(['administrador', 'junta_directiva', 'residente'] as const)('%s no puede usar el registro de visitantes', async (role) => {
    const user = { ...guard, role };
    await expectError(listUnits(user), 'forbidden');
    await expectError(findVisitorName('CC', '1012345678', user), 'forbidden');
    await expectError(listVisitorsInside(user), 'forbidden');
    await expectError(registerEntry(valid, user), 'forbidden');
    await expectError(registerExit('v-2', user), 'forbidden');
  });
});
