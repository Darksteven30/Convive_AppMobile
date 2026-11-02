// Noticias y comunicados con Supabase (RF19). Cumple el mismo contrato que el servicio simulado
// (news.types.ts). El esquema y las funciones están en supabase/migrations/20261102000000_noticias.sql
// y 20261103000000_vigencia_noticias.sql: noticias_conjunto() y detalle_noticia() solo devuelven
// comunicados del conjunto de la sesión (todos, o solo los que no han vencido), y publicar_noticia(),
// editar_noticia() y eliminar_noticia() validan que sea el administrador.

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import { NewsError, type NewsBackend, type NewsInput, type NewsItem, type NewsQuery } from '@/services/news.types';
import { normalizeNews, validateNews } from '@/services/news.validation';

/** Fila que devuelven noticias_conjunto(), detalle_noticia(), publicar_noticia() y editar_noticia(). */
type NewsRow = {
  id: string;
  titulo: string;
  cuerpo: string;
  publicada_por: string;
  created_at: string;
  updated_at: string | null;
  visible_hasta: string | null;
};

type RpcError = { message?: string };

const toNewsItem = (row: NewsRow): NewsItem => ({
  id: row.id,
  title: row.titulo,
  body: row.cuerpo,
  author: row.publicada_por,
  publishedAt: row.created_at,
  updatedAt: row.updated_at,
  visibleUntil: row.visible_hasta,
});

/** Traduce los errores de las funciones de RF19 al contrato de la app. */
function toNewsError(error: RpcError): NewsError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new NewsError('forbidden');
  if (message.includes('no_encontrada')) return new NewsError('not_found');
  if (message.includes('titulo_invalido')) return new NewsError('validation', { title: MSG.RF19.titleInvalid });
  if (message.includes('cuerpo_invalido')) return new NewsError('validation', { body: MSG.RF19.bodyInvalid });
  if (message.includes('vigencia_invalida')) {
    return new NewsError('validation', { visibleUntil: MSG.RF19.visibleUntilPast });
  }
  return null;
}

function assertValid(input: NewsInput) {
  const errors = validateNews(input);
  if (Object.keys(errors).length > 0) {
    throw new NewsError('validation', errors);
  }
}

async function listNews(_user: User, query: NewsQuery = {}): Promise<NewsItem[]> {
  const { data, error } = await getSupabase().rpc('noticias_conjunto', {
    p_limite: query.limit ?? null,
    p_solo_vigentes: query.activeOnly ?? false,
  });
  if (error) throw toNewsError(error) ?? error;
  return ((data ?? []) as NewsRow[]).map(toNewsItem);
}

async function getNews(id: string, _user: User): Promise<NewsItem> {
  const { data, error } = await getSupabase().rpc('detalle_noticia', { p_id: id }).maybeSingle();
  if (error || !data) {
    throw (error && toNewsError(error)) ?? error ?? new NewsError('not_found');
  }
  return toNewsItem(data as NewsRow);
}

async function publishNews(input: NewsInput, _user: User): Promise<NewsItem> {
  assertValid(input);
  const { title, body, visibleUntil } = normalizeNews(input);
  const { data, error } = await getSupabase()
    .rpc('publicar_noticia', { p_titulo: title, p_cuerpo: body, p_visible_hasta: visibleUntil })
    .maybeSingle();
  if (error || !data) {
    throw (error && toNewsError(error)) ?? error ?? new Error('sin_respuesta');
  }
  return toNewsItem(data as NewsRow);
}

async function updateNews(id: string, input: NewsInput, _user: User): Promise<NewsItem> {
  assertValid(input);
  const { title, body, visibleUntil } = normalizeNews(input);
  const { data, error } = await getSupabase()
    .rpc('editar_noticia', { p_id: id, p_titulo: title, p_cuerpo: body, p_visible_hasta: visibleUntil })
    .maybeSingle();
  if (error || !data) {
    throw (error && toNewsError(error)) ?? error ?? new Error('sin_respuesta');
  }
  return toNewsItem(data as NewsRow);
}

async function deleteNews(id: string, _user: User): Promise<void> {
  const { error } = await getSupabase().rpc('eliminar_noticia', { p_id: id });
  if (error) throw toNewsError(error) ?? error;
}

export const newsBackend = {
  listNews,
  getNews,
  publishNews,
  updateNews,
  deleteNews,
} satisfies NewsBackend;
