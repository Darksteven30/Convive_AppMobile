// Tipos y contrato común de las noticias y comunicados (RF19, propuesto). Lo cumplen el servicio
// simulado (news.mock.ts) y el de Supabase (news.supabase.ts); las pantallas solo conocen este
// contrato vía news.service.ts.

import type { User } from '@/services/auth.types';

export const TITLE_MIN = 5;
export const TITLE_MAX = 60;
export const BODY_MIN = 10;
export const BODY_MAX = 2000;
/** Cuántos comunicados muestra «Últimas noticias» en Inicio (RF18). */
export const LATEST_NEWS_LIMIT = 3;

export type NewsInput = {
  title: string;
  body: string;
  /**
   * Fecha y hora ISO hasta la que se ve en «Últimas noticias»; después sigue en el histórico.
   * null u omitido: no vence.
   */
  visibleUntil?: string | null;
};

/** Qué comunicados consultar. */
export type NewsQuery = {
  /** Cuántos como máximo (Inicio). */
  limit?: number;
  /** Solo los que no han vencido (Inicio); sin esto, todos (histórico y administrador). */
  activeOnly?: boolean;
};

/** Comunicado del conjunto. Las fechas las pone el servidor. */
export type NewsItem = {
  id: string;
  title: string;
  body: string;
  /** Nombre de quien lo publicó. */
  author: string;
  publishedAt: string;
  /** Última edición, o null si no se ha editado. */
  updatedAt: string | null;
  /** Hasta cuándo sale en Inicio, o null si no vence. */
  visibleUntil: string | null;
};

export type NewsField = 'title' | 'body' | 'visibleUntil';
export type NewsErrors = Partial<Record<NewsField, string>>;

export class NewsError extends Error {
  constructor(
    /** not_found: el comunicado no existe, es de otro conjunto o ya se eliminó. */
    public readonly code: 'forbidden' | 'validation' | 'not_found',
    public readonly fieldErrors: NewsErrors = {},
  ) {
    super(code);
    this.name = 'NewsError';
  }
}

/** Funciones que debe ofrecer cada implementación de las noticias. */
export type NewsBackend = {
  /** Comunicados del conjunto del más reciente al más antiguo (todos, o solo los vigentes). */
  listNews(user: User, query?: NewsQuery): Promise<NewsItem[]>;
  /** Un comunicado del conjunto. Falla con NewsError('not_found'). */
  getNews(id: string, user: User): Promise<NewsItem>;
  /** Solo el administrador. Falla con NewsError. */
  publishNews(input: NewsInput, user: User): Promise<NewsItem>;
  /** Solo el administrador. Falla con NewsError. */
  updateNews(id: string, input: NewsInput, user: User): Promise<NewsItem>;
  /** Solo el administrador. Falla con NewsError. */
  deleteNews(id: string, user: User): Promise<void>;
};

/** Ya pasó su «visible hasta»: no sale en Inicio, solo en el histórico. */
export const isExpired = (item: Pick<NewsItem, 'visibleUntil'>, now = new Date()) =>
  item.visibleUntil !== null && new Date(item.visibleUntil).getTime() <= now.getTime();

/** Del más reciente al más antiguo. */
export const newestFirst = (a: NewsItem, b: NewsItem) => b.publishedAt.localeCompare(a.publishedAt);
