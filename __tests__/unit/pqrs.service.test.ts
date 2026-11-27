import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import {
  NEXT_STATUSES,
  changePqrsStatus,
  createPqrs,
  formatPqrsNumber,
  getPqrsDetail,
  listConjuntoPqrs,
  listMyPqrs,
  mockAdminNotifications,
  mockNotifications,
  photoError,
  pqrsTypeLabel,
  resetMockPqrsState,
  validatePqrs,
  validateStatusChange,
  type Photo,
  type PqrsInput,
  type StatusChangeInput,
} from '@/services/pqrs.service';

const MB = 1024 * 1024;

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
  complex: '',
  role: 'residente',
  ...overrides,
});

const jpg: Photo = { uri: 'file:///a.jpg', mimeType: 'image/jpeg', size: 2 * MB };
const valid: PqrsInput = {
  type: 'reporte_dano',
  description: '  La baranda de la escalera de la torre 2 está suelta.  ',
  photos: [jpg],
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 22, 10, 0));
  resetMockPqrsState();
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

describe('RF07 · reglas', () => {
  it('formatea el radicado con 4 dígitos y el tipo con su nombre', () => {
    expect(formatPqrsNumber(4)).toBe('#0004');
    expect(formatPqrsNumber(12345)).toBe('#12345');
    expect(pqrsTypeLabel('reporte_dano')).toBe('Reporte de daño');
    expect(pqrsTypeLabel('peticion')).toBe('Petición');
  });

  it('cada foto debe ser JPG o PNG (MSG-RF07-04) de máx. 5 MB (MSG-RF07-05)', () => {
    expect(photoError(jpg)).toBeNull();
    expect(photoError({ mimeType: 'IMAGE/PNG', size: 5 * MB })).toBeNull();
    expect(photoError({ mimeType: 'image/png' })).toBeNull();
    expect(photoError({ mimeType: 'image/gif', size: 1 })).toBe(MSG.RF07.invalidFormat);
    expect(photoError({ mimeType: 'image/heic', size: 1 })).toBe(MSG.RF07.invalidFormat);
    expect(photoError({ mimeType: 'image/jpeg', size: 5 * MB + 1 })).toBe(MSG.RF07.tooLarge);
  });

  it('acepta una PQRS válida', () => {
    expect(validatePqrs(valid)).toEqual({});
    expect(validatePqrs({ type: 'peticion', description: 'x'.repeat(20), photos: [] })).toEqual({});
  });

  it('exige el tipo (MSG-RF07-02) y una descripción de 20 a 1.000 caracteres (MSG-RF07-03)', () => {
    expect(validatePqrs({ ...valid, type: undefined }).type).toBe(MSG.RF07.typeRequired);
    expect(validatePqrs({ ...valid, type: 'otro' as never }).type).toBe(MSG.RF07.typeRequired);
    expect(validatePqrs({ ...valid, description: `  ${'x'.repeat(19)}  ` }).description).toBe(MSG.RF07.descriptionShort);
    expect(validatePqrs({ ...valid, description: 'x'.repeat(1001) }).description).toBe(MSG.RF07.descriptionShort);
    expect(validatePqrs({ ...valid, description: 'x'.repeat(1000) }).description).toBeUndefined();
  });

  it('valida las fotos: formato, tamaño, máximo 3 y obligatoria en el reporte de daño', () => {
    expect(validatePqrs({ ...valid, photos: [jpg, { ...jpg, mimeType: 'image/gif' }] }).photos).toBe(
      MSG.RF07.invalidFormat,
    );
    expect(validatePqrs({ ...valid, photos: [{ ...jpg, size: 6 * MB }] }).photos).toBe(MSG.RF07.tooLarge);
    expect(validatePqrs({ ...valid, photos: [jpg, jpg, jpg, jpg] }).photos).toBe(MSG.RF07.tooManyPhotos);
    expect(validatePqrs({ ...valid, photos: [] }).photos).toBe(MSG.RF07.photoRequired);
    expect(validatePqrs({ ...valid, type: 'queja', photos: [] }).photos).toBeUndefined();
  });
});

describe('RF07 · servicio simulado', () => {
  it('lista solo las PQRS del usuario, de la más reciente a la más antigua', async () => {
    const list = await run(listMyPqrs(user()));

    expect(list.map((item) => item.number)).toEqual([3, 2, 1]);
    expect(list[0]).toMatchObject({ type: 'reporte_dano', status: 'pendiente' });
    expect(await run(listMyPqrs(user({ id: 'u3' })))).toEqual([]);
  });

  it('el detalle trae el historial de respuestas en orden', async () => {
    const detail = await run(getPqrsDetail('pq-1', user()));

    expect(detail.status).toBe('resuelto');
    expect(detail.responses.map((item) => item.status)).toEqual(['en_proceso', 'resuelto']);
    expect(detail.responses[0].author).toBe('David Muñoz');
  });

  it('solo su autor (o la administración) ve el detalle', async () => {
    await expectError(getPqrsDetail('pq-1', user({ id: 'u3' })), 'not_found');
    await expectError(getPqrsDetail('no-existe', user()), 'not_found');

    const forAdmin = await run(getPqrsDetail('pq-1', user({ id: 'u2', role: 'administrador' })));
    expect(forAdmin.number).toBe(1);
  });

  it('radica con el siguiente consecutivo, en estado pendiente, y avisa a la administración', async () => {
    const created = await run(createPqrs(valid, user()));

    expect(created).toMatchObject({
      number: 4,
      type: 'reporte_dano',
      status: 'pendiente',
      description: 'La baranda de la escalera de la torre 2 está suelta.',
    });
    expect((await run(createPqrs({ ...valid, type: 'queja' }, user()))).number).toBe(5);

    expect(mockAdminNotifications()).toEqual([
      { recipientId: 'u2', title: 'Nueva PQRS', message: 'Monica Galvis radicó la solicitud #0004.', pqrsId: created.id },
      expect.objectContaining({ message: 'Monica Galvis radicó la solicitud #0005.' }),
    ]);

    const detail = await run(getPqrsDetail(created.id, user()));
    expect(detail.photos).toHaveLength(1);
    expect(detail.responses).toEqual([]);
    // La más reciente (#0005) queda de primera en la lista.
    expect((await run(listMyPqrs(user()))).map((item) => item.number)).toEqual([5, 4, 3, 2, 1]);
  });

  it('rechaza datos inválidos sin radicar ni avisar', async () => {
    await expectError(createPqrs({ ...valid, photos: [] }, user()), 'validation', { photos: MSG.RF07.photoRequired });
    await expectError(createPqrs({ ...valid, description: 'corta' }, user()), 'validation', {
      description: MSG.RF07.descriptionShort,
    });

    expect(mockAdminNotifications()).toEqual([]);
    expect(await run(listMyPqrs(user()))).toHaveLength(3);
  });
});

describe('RF08 · reglas del cambio de estado', () => {
  it('el flujo es Pendiente → En proceso → Resuelto y «Resuelto» es final', () => {
    expect(NEXT_STATUSES).toEqual({ pendiente: ['en_proceso'], en_proceso: ['resuelto'], resuelto: [] });
  });

  it('acepta solo las transiciones del flujo (MSG-RF08-03)', () => {
    expect(validateStatusChange({ currentStatus: 'pendiente', status: 'en_proceso', comment: '' })).toEqual({});
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'resuelto', comment: 'Ya se reparó el portón.' })).toEqual({});

    expect(validateStatusChange({ currentStatus: 'pendiente', status: 'resuelto', comment: 'Ya se reparó el portón.' }).status).toBe(
      MSG.RF08.invalidTransition('Pendiente', 'Resuelto'),
    );
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'pendiente', comment: '' }).status).toBe(
      MSG.RF08.invalidTransition('En proceso', 'Pendiente'),
    );
    expect(validateStatusChange({ currentStatus: 'resuelto', status: 'en_proceso', comment: '' }).status).toBe(
      MSG.RF08.invalidTransition('Resuelto', 'En proceso'),
    );
    expect(validateStatusChange({ currentStatus: 'pendiente', comment: '' }).status).toBe(MSG.RF08.statusRequired);
  });

  it('el comentario es obligatorio al resolver (MSG-RF08-02) y, si se escribe, tiene de 10 a 500 caracteres', () => {
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'resuelto', comment: '   ' }).comment).toBe(
      MSG.RF08.commentRequired,
    );
    expect(validateStatusChange({ currentStatus: 'pendiente', status: 'en_proceso', comment: 'Corto' }).comment).toBe(
      MSG.RF08.commentLength,
    );
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'resuelto', comment: 'x'.repeat(501) }).comment).toBe(
      MSG.RF08.commentLength,
    );
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'resuelto', comment: `  ${'x'.repeat(10)}  ` }).comment).toBeUndefined();
    expect(validateStatusChange({ currentStatus: 'en_proceso', status: 'resuelto', comment: 'x'.repeat(500) }).comment).toBeUndefined();
  });
});

describe('RF08 · servicio simulado', () => {
  const admin = user({ id: 'u2', name: 'David Muñoz', house: 'Administración', role: 'administrador' });
  const toProcess: StatusChangeInput = { pqrsId: 'pq-3', currentStatus: 'pendiente', status: 'en_proceso', comment: '' };

  it('el administrador ve todas las PQRS del conjunto con quién las radicó', async () => {
    const list = await run(listConjuntoPqrs(admin));

    expect(list.map((item) => item.number)).toEqual([3, 2, 1]);
    expect(list[0]).toMatchObject({ owner: 'Monica Galvis', unit: '56' });
  });

  it.each(['residente', 'junta_directiva', 'vigilancia'] as const)('%s no puede listar ni cambiar estados (MSG-RF08-04)', async (role) => {
    await expectError(listConjuntoPqrs(user({ role })), 'forbidden');
    await expectError(changePqrsStatus(toProcess, user({ role })), 'forbidden');
    expect((await run(getPqrsDetail('pq-3', user()))).status).toBe('pendiente');
  });

  it('cambia el estado, deja la respuesta con usuario y fecha y avisa al propietario', async () => {
    const response = await run(changePqrsStatus(toProcess, admin));

    expect(response).toMatchObject({
      author: 'David Muñoz',
      message: 'Cambió el estado a En proceso.',
      status: 'en_proceso',
      // Fecha y hora del cambio (la latencia simulada suma unos milisegundos).
      createdAt: expect.stringMatching(new RegExp(`^${new Date(2026, 9, 22, 10, 0).toISOString().slice(0, 16)}`)),
    });
    const detail = await run(getPqrsDetail('pq-3', user()));
    expect(detail.status).toBe('en_proceso');
    expect(detail.responses).toEqual([response]);
    expect(mockNotifications()).toEqual([
      {
        recipientId: 'u1',
        title: 'Tu PQRS cambió de estado',
        message: 'Tu solicitud #0003 ahora está «En proceso».',
        pqrsId: 'pq-3',
      },
    ]);
  });

  it('al resolver guarda el comentario y luego no admite más cambios', async () => {
    await run(changePqrsStatus(toProcess, admin));
    const resolved = await run(
      changePqrsStatus({ pqrsId: 'pq-3', currentStatus: 'en_proceso', status: 'resuelto', comment: '  Se ajustó el motor del portón.  ' }, admin),
    );

    expect(resolved.message).toBe('Se ajustó el motor del portón.');
    await expectError(
      changePqrsStatus({ pqrsId: 'pq-3', currentStatus: 'resuelto', status: 'en_proceso', comment: '' }, admin),
      'validation',
      { status: MSG.RF08.invalidTransition('Resuelto', 'En proceso') },
    );
  });

  it('valida contra el estado guardado, no contra el que creía la pantalla', async () => {
    await run(changePqrsStatus(toProcess, admin));

    // La pantalla aún creía que estaba «Pendiente».
    await expectError(changePqrsStatus(toProcess, admin), 'validation', {
      status: MSG.RF08.invalidTransition('En proceso', 'En proceso'),
    });
    expect((await run(getPqrsDetail('pq-3', admin))).responses).toHaveLength(1);
  });

  it('rechaza resolver sin respuesta y PQRS inexistentes', async () => {
    await expectError(
      changePqrsStatus({ pqrsId: 'pq-2', currentStatus: 'en_proceso', status: 'resuelto', comment: '' }, admin),
      'validation',
      { comment: MSG.RF08.commentRequired },
    );
    await expectError(changePqrsStatus({ ...toProcess, pqrsId: 'no-existe' }, admin), 'not_found');
    expect(mockNotifications()).toEqual([]);
    expect(mockAdminNotifications()).toEqual([]);
  });

  it('el detalle trae quién la radicó solo para el administrador', async () => {
    expect((await run(getPqrsDetail('pq-3', admin))).owner).toBe('Monica Galvis');
    expect((await run(getPqrsDetail('pq-3', user()))).owner).toBeUndefined();
  });
});
