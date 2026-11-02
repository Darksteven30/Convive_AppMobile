// Punto de entrada de las noticias y comunicados (RF19): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa news.supabase.ts; si no, el servicio
// simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { newsBackend as mockBackend } from '@/services/news.mock';
import { newsBackend as supabaseBackend } from '@/services/news.supabase';
import type { NewsBackend } from '@/services/news.types';

export {
  BODY_MAX,
  BODY_MIN,
  LATEST_NEWS_LIMIT,
  NewsError,
  isExpired,
  TITLE_MAX,
  TITLE_MIN,
  type NewsErrors,
  type NewsField,
  type NewsInput,
  type NewsItem,
  type NewsQuery,
} from '@/services/news.types';
export {
  isValidBody,
  isValidTitle,
  isValidVisibleUntil,
  normalizeNews,
  validateNews,
  visibleLength,
} from '@/services/news.validation';
// Solo para las pruebas y el modo simulado.
export { mockNewsNotifications, resetMockNewsState } from '@/services/news.mock';

const backend: NewsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const listNews: NewsBackend['listNews'] = (...args) => backend.listNews(...args);
export const getNews: NewsBackend['getNews'] = (...args) => backend.getNews(...args);
export const publishNews: NewsBackend['publishNews'] = (...args) => backend.publishNews(...args);
export const updateNews: NewsBackend['updateNews'] = (...args) => backend.updateNews(...args);
export const deleteNews: NewsBackend['deleteNews'] = (...args) => backend.deleteNews(...args);
