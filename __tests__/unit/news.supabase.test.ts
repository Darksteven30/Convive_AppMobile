import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { newsBackend as supabaseNews } from '@/services/news.supabase';

// Cliente de Supabase simulado: se verifica cómo el servicio llama a las funciones de la base de
// datos (supabase/migrations/20261102000000_noticias.sql) y traduce sus respuestas y errores al
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

const row = {
  id: 'noticia-1',
  titulo: 'Corte de agua programado',
  cuerpo: 'Mañana no habrá agua de 8:00 a 10:00 a. m.',
  publicada_por: 'David Muñoz',
  created_at: '2026-11-02T15:30:00+00:00',
  updated_at: null,
  visible_hasta: null,
};

const item = {
  id: 'noticia-1',
  title: 'Corte de agua programado',
  body: 'Mañana no habrá agua de 8:00 a 10:00 a. m.',
  author: 'David Muñoz',
  publishedAt: '2026-11-02T15:30:00+00:00',
  updatedAt: null,
  visibleUntil: null,
};

const input = { title: '  Corte de agua programado ', body: ' Mañana no habrá agua de 8:00 a 10:00 a. m. ' };

beforeEach(() => {
  rpcResults = {};
  mockRpc.mockClear();
});

describe('RF19 · noticias con Supabase', () => {
  it('lista con noticias_conjunto(): todos para el histórico, o solo los vigentes y con límite para Inicio', async () => {
    rpcResults.noticias_conjunto = { data: [row], error: null };

    expect(await supabaseNews.listNews(admin)).toEqual([item]);
    expect(mockRpc).toHaveBeenLastCalledWith('noticias_conjunto', { p_limite: null, p_solo_vigentes: false });

    await supabaseNews.listNews(admin, { limit: 3, activeOnly: true });
    expect(mockRpc).toHaveBeenLastCalledWith('noticias_conjunto', { p_limite: 3, p_solo_vigentes: true });
  });

  it('consulta el detalle con detalle_noticia() y traduce no_encontrada', async () => {
    rpcResults.detalle_noticia = { data: [{ ...row, updated_at: '2026-11-02T16:00:00+00:00' }], error: null };
    expect(await supabaseNews.getNews('noticia-1', admin)).toEqual({ ...item, updatedAt: '2026-11-02T16:00:00+00:00' });
    expect(mockRpc).toHaveBeenLastCalledWith('detalle_noticia', { p_id: 'noticia-1' });

    rpcResults.detalle_noticia = { data: null, error: { message: 'no_encontrada' } };
    await expect(supabaseNews.getNews('x', admin)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('publica con publicar_noticia() enviando los textos sin espacios de sobra', async () => {
    rpcResults.publicar_noticia = { data: [row], error: null };

    expect(await supabaseNews.publishNews(input, admin)).toEqual(item);
    expect(mockRpc).toHaveBeenCalledWith('publicar_noticia', {
      p_titulo: 'Corte de agua programado',
      p_cuerpo: 'Mañana no habrá agua de 8:00 a 10:00 a. m.',
      p_visible_hasta: null,
    });
  });

  it('envía «visible hasta» y lo devuelve en el comunicado', async () => {
    rpcResults.publicar_noticia = { data: [{ ...row, visible_hasta: '2099-11-09T11:00:00+00:00' }], error: null };

    const published = await supabaseNews.publishNews({ ...input, visibleUntil: '2099-11-09T11:00:00.000Z' }, admin);

    expect(published.visibleUntil).toBe('2099-11-09T11:00:00+00:00');
    expect(mockRpc).toHaveBeenCalledWith('publicar_noticia', expect.objectContaining({ p_visible_hasta: '2099-11-09T11:00:00.000Z' }));
  });

  it('no llama al servidor si los datos son inválidos', async () => {
    await expect(supabaseNews.publishNews({ title: 'Agua', body: 'Corto' }, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { title: MSG.RF19.titleInvalid, body: MSG.RF19.bodyInvalid },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('edita con editar_noticia() y elimina con eliminar_noticia()', async () => {
    rpcResults.editar_noticia = { data: [row], error: null };
    expect(await supabaseNews.updateNews('noticia-1', input, admin)).toEqual(item);
    expect(mockRpc).toHaveBeenCalledWith('editar_noticia', {
      p_id: 'noticia-1',
      p_titulo: 'Corte de agua programado',
      p_cuerpo: 'Mañana no habrá agua de 8:00 a 10:00 a. m.',
      p_visible_hasta: null,
    });

    await supabaseNews.deleteNews('noticia-1', admin);
    expect(mockRpc).toHaveBeenLastCalledWith('eliminar_noticia', { p_id: 'noticia-1' });
  });

  it.each([
    ['sin_permiso', { code: 'forbidden' }],
    ['no_encontrada', { code: 'not_found' }],
    ['titulo_invalido', { code: 'validation', fieldErrors: { title: MSG.RF19.titleInvalid } }],
    ['cuerpo_invalido', { code: 'validation', fieldErrors: { body: MSG.RF19.bodyInvalid } }],
    ['vigencia_invalida', { code: 'validation', fieldErrors: { visibleUntil: MSG.RF19.visibleUntilPast } }],
  ])('traduce el error %s del servidor', async (message, expected) => {
    rpcResults.publicar_noticia = { data: null, error: { message } };
    rpcResults.editar_noticia = { data: null, error: { message } };
    rpcResults.eliminar_noticia = { data: null, error: { message } };

    await expect(supabaseNews.publishNews(input, admin)).rejects.toMatchObject(expected);
    await expect(supabaseNews.updateNews('noticia-1', input, admin)).rejects.toMatchObject(expected);
    if (expected.code !== 'validation') {
      await expect(supabaseNews.deleteNews('noticia-1', admin)).rejects.toMatchObject(expected);
    }
  });

  it('deja pasar los errores que no son de RF19', async () => {
    const error = { message: 'Failed to fetch' };
    rpcResults.noticias_conjunto = { data: null, error };
    await expect(supabaseNews.listNews(admin)).rejects.toBe(error);
  });
});
