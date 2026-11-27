import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { mockNetwork } from '@/services/mockNetwork';
import {
  LATEST_NEWS_LIMIT,
  deleteNews,
  getNews,
  isExpired,
  isValidBody,
  isValidTitle,
  isValidVisibleUntil,
  listNews,
  mockNewsNotifications,
  normalizeNews,
  publishNews,
  resetMockNewsState,
  updateNews,
  validateNews,
  visibleLength,
  type NewsInput,
} from '@/services/news.service';

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
const resident: User = { ...admin, id: 'u1', name: 'Monica Galvis', email: 'monica@gmail.com', house: '56', role: 'residente' };

const valid: NewsInput = {
  title: '  Corte de agua programado ',
  body: ' Mañana no habrá agua de 8:00 a 10:00 a. m. por arreglos en el tanque. ',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-02T15:30:00.000Z'));
  resetMockNewsState();
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

describe('RF19 · validaciones', () => {
  it('título de 5 a 60 caracteres visibles, sin contar los espacios de los extremos', () => {
    expect(isValidTitle('Aviso')).toBe(true);
    expect(isValidTitle('a'.repeat(60))).toBe(true);
    expect(isValidTitle('  Agua  ')).toBe(false);
    expect(isValidTitle('a'.repeat(61))).toBe(false);
    expect(isValidTitle('')).toBe(false);
    // Un emoji cuenta como un carácter, igual que char_length() en PostgreSQL.
    expect(visibleLength('Fiesta 🎉')).toBe(8);
    expect(isValidTitle('🎉'.repeat(60))).toBe(true);
  });

  it('mensaje de 10 a 2.000 caracteres', () => {
    expect(isValidBody('Diez letra')).toBe(true);
    expect(isValidBody('a'.repeat(2000))).toBe(true);
    expect(isValidBody('  Corto   ')).toBe(false);
    expect(isValidBody('a'.repeat(2001))).toBe(false);
  });

  it('«visible hasta» es opcional y, si existe, debe ser posterior a este momento', () => {
    expect(isValidVisibleUntil(null)).toBe(true);
    expect(isValidVisibleUntil(undefined)).toBe(true);
    expect(isValidVisibleUntil('2026-11-02T15:31:00.000Z')).toBe(true);
    expect(isValidVisibleUntil('2026-11-02T15:30:00.000Z')).toBe(false);
    expect(isValidVisibleUntil('2026-11-01T15:30:00.000Z')).toBe(false);
    expect(validateNews({ ...valid, visibleUntil: '2026-11-01T00:00:00.000Z' })).toEqual({
      visibleUntil: MSG.RF19.visibleUntilPast,
    });
  });

  it('devuelve un mensaje por campo inválido', () => {
    expect(validateNews(valid)).toEqual({});
    expect(validateNews({})).toEqual({ title: MSG.RF19.titleInvalid, body: MSG.RF19.bodyInvalid });
    expect(validateNews({ ...valid, body: 'Corto' })).toEqual({ body: MSG.RF19.bodyInvalid });
    expect(normalizeNews({ title: '  Hola  ', body: ' Mundo ' })).toEqual({ title: 'Hola', body: 'Mundo', visibleUntil: null });
  });
});

describe('RF19 · servicio simulado', () => {
  it('lista todos los comunicados (también los vencidos) del más reciente al más antiguo para cualquier rol', async () => {
    for (const user of [admin, resident, { ...admin, role: 'vigilancia' as const }]) {
      const items = await run(listNews(user));
      expect(items.map((item) => item.title)).toEqual([
        'Mantenimiento de ascensor',
        'Piscina cerrada este fin de semana',
        'Asamblea general',
        'Cambio horario piscina',
      ]);
    }
  });

  it('para «Últimas noticias» deja solo los vigentes y limita la lista', async () => {
    const active = await run(listNews(resident, { activeOnly: true }));
    expect(active.map((item) => item.title)).toEqual(['Mantenimiento de ascensor', 'Asamblea general', 'Cambio horario piscina']);

    await run(publishNews(valid, admin));
    expect(await run(listNews(resident, { limit: LATEST_NEWS_LIMIT, activeOnly: true }))).toHaveLength(3);
    expect(await run(listNews(resident))).toHaveLength(5);
  });

  it('un comunicado con «visible hasta» sale de los vigentes cuando pasa esa hora, sin borrarse', async () => {
    const item = await run(publishNews({ ...valid, visibleUntil: '2026-11-02T18:00:00.000Z' }, admin));
    expect(item.visibleUntil).toBe('2026-11-02T18:00:00.000Z');
    expect(isExpired(item)).toBe(false);
    expect((await run(listNews(resident, { activeOnly: true })))[0].id).toBe(item.id);

    jest.setSystemTime(new Date('2026-11-02T18:00:00.000Z'));

    expect(isExpired(item)).toBe(true);
    expect((await run(listNews(resident, { activeOnly: true }))).map((news) => news.id)).not.toContain(item.id);
    expect((await run(listNews(resident)))[0].id).toBe(item.id);
    expect(await run(getNews(item.id, resident))).toMatchObject({ title: 'Corte de agua programado' });
  });

  it('al editar se puede quitar «visible hasta» y el comunicado vencido vuelve a Inicio', async () => {
    const updated = await run(updateNews('n-4', { title: 'Piscina cerrada este fin de semana', body: 'Vuelve a abrir el martes.', visibleUntil: null }, admin));

    expect(updated.visibleUntil).toBeNull();
    expect((await run(listNews(resident, { activeOnly: true }))).map((news) => news.id)).toContain('n-4');
  });

  it('consulta el detalle y falla si no existe', async () => {
    expect(await run(getNews('n-2', resident))).toMatchObject({ title: 'Asamblea general', author: 'David Muñoz', updatedAt: null });
    await expectError(getNews('no-existe', resident), 'not_found');
  });

  it('publica con la hora del servidor, sin espacios de sobra, y avisa a los demás', async () => {
    const item = await run(publishNews(valid, admin));

    expect(item).toMatchObject({
      title: 'Corte de agua programado',
      body: 'Mañana no habrá agua de 8:00 a 10:00 a. m. por arreglos en el tanque.',
      author: 'David Muñoz',
      publishedAt: '2026-11-02T15:30:00.000Z',
      updatedAt: null,
    });
    expect((await run(listNews(resident)))[0].id).toBe(item.id);
    expect(mockNewsNotifications()).toEqual(
      ['u1', 'u3', 'u4', 'u5'].map((recipientId) => ({
        recipientId,
        title: 'Nuevo comunicado',
        message: 'Corte de agua programado',
        newsId: item.id,
      })),
    );
  });

  it('rechaza los datos inválidos como el servidor', async () => {
    await expectError(publishNews({ ...valid, title: 'Agua' }, admin), 'validation', { title: MSG.RF19.titleInvalid });
    await expectError(updateNews('n-1', { ...valid, body: 'Corto' }, admin), 'validation', { body: MSG.RF19.bodyInvalid });
  });

  it('edita guardando la hora de la edición y actualiza el aviso pendiente', async () => {
    const item = await run(publishNews(valid, admin));
    jest.setSystemTime(new Date('2026-11-02T16:00:00.000Z'));

    const updated = await run(updateNews(item.id, { title: 'Corte de agua', body: 'Será de 9:00 a 11:00 a. m.' }, admin));

    expect(updated).toMatchObject({
      title: 'Corte de agua',
      body: 'Será de 9:00 a 11:00 a. m.',
      publishedAt: '2026-11-02T15:30:00.000Z',
      updatedAt: '2026-11-02T16:00:00.000Z',
    });
    expect(mockNewsNotifications().every((notification) => notification.message === 'Corte de agua')).toBe(true);
    await expectError(updateNews('no-existe', valid, admin), 'not_found');
  });

  it('elimina el comunicado y sus avisos', async () => {
    const item = await run(publishNews(valid, admin));

    await run(deleteNews(item.id, admin));

    expect((await run(listNews(resident))).map((news) => news.id)).not.toContain(item.id);
    expect(mockNewsNotifications()).toEqual([]);
    await expectError(deleteNews(item.id, admin), 'not_found');
  });

  it.each(['residente', 'junta_directiva', 'vigilancia'] as const)('%s no puede publicar, editar ni eliminar', async (role) => {
    const user = { ...admin, role };
    await expectError(publishNews(valid, user), 'forbidden');
    await expectError(updateNews('n-1', valid, user), 'forbidden');
    await expectError(deleteNews('n-1', user), 'forbidden');
    expect(await run(listNews(user))).toHaveLength(4);
  });
});
