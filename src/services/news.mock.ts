// Noticias y comunicados simulados (mock) para RF19. Se usa cuando la app no tiene configurado
// Supabase (y siempre en las pruebas). Replica los comunicados de ejemplo de supabase/seed.sql y las
// reglas de publicar_noticia(), editar_noticia() y eliminar_noticia() en el servidor.

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  NewsError,
  isExpired,
  newestFirst,
  type NewsBackend,
  type NewsInput,
  type NewsItem,
  type NewsQuery,
} from '@/services/news.types';
import { normalizeNews, validateNews } from '@/services/news.validation';

// Comunicados de ejemplo, los mismos de los bloques «RF19» de seed.sql. «Piscina cerrada este fin
// de semana» fue visible hasta el lunes 2 de noviembre a las 6:00 a. m.: ya solo sale en el histórico.
const seedNews: NewsItem[] = [
  {
    id: 'n-1',
    title: 'Mantenimiento de ascensor',
    body: 'El jueves 5 de noviembre, de 8:00 a. m. a 12:00 m., se hará el mantenimiento preventivo del ascensor. Durante ese horario usen las escaleras.',
    author: 'David Muñoz',
    publishedAt: '2026-10-30T14:00:00.000Z',
    updatedAt: null,
    visibleUntil: null,
  },
  {
    id: 'n-4',
    title: 'Piscina cerrada este fin de semana',
    body: 'El sábado 31 de octubre y el domingo 1 de noviembre la piscina estará cerrada por mantenimiento. El lunes vuelve a abrir en su horario normal.',
    author: 'David Muñoz',
    publishedAt: '2026-10-29T22:00:00.000Z',
    updatedAt: null,
    visibleUntil: '2026-11-02T11:00:00.000Z',
  },
  {
    id: 'n-2',
    title: 'Asamblea general',
    body: 'Los invitamos a la asamblea general de propietarios el sábado 14 de noviembre a las 9:00 a. m. en el salón social. Se revisará el presupuesto de 2027.',
    author: 'David Muñoz',
    publishedAt: '2026-10-27T23:00:00.000Z',
    updatedAt: null,
    visibleUntil: null,
  },
  {
    id: 'n-3',
    title: 'Cambio horario piscina',
    body: 'Desde el lunes 2 de noviembre la piscina abre de martes a domingo, de 9:00 a. m. a 7:00 p. m. Los lunes se cierra por mantenimiento.',
    author: 'David Muñoz',
    publishedAt: '2026-10-24T15:00:00.000Z',
    updatedAt: null,
    visibleUntil: null,
  },
];

/** Aviso «Nuevo comunicado» para RF09 (solo para las pruebas). */
export type MockNewsNotification = { recipientId: string; title: string; message: string; newsId: string };

// Personas del conjunto simulado (auth.mock.ts) que reciben el aviso al publicar.
const MEMBER_IDS = ['u1', 'u2', 'u3', 'u4', 'u5'];

let news: NewsItem[] = [];
let notifications: MockNewsNotification[] = [];
let nextId = 1;

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockNewsState() {
  news = seedNews.map((item) => ({ ...item }));
  notifications = [];
  nextId = 1;
}
resetMockNewsState();

/** Avisos creados al publicar (solo para las pruebas). */
export function mockNewsNotifications(): MockNewsNotification[] {
  return [...notifications];
}

function assertAdmin(user: User) {
  if (user.role !== 'administrador') {
    throw new NewsError('forbidden');
  }
}

function assertValid(input: NewsInput) {
  const errors = validateNews(input);
  if (Object.keys(errors).length > 0) {
    throw new NewsError('validation', errors);
  }
}

function findNews(id: string): NewsItem {
  const item = news.find((candidate) => candidate.id === id);
  if (!item) {
    throw new NewsError('not_found');
  }
  return item;
}

async function listNews(_user: User, query: NewsQuery = {}): Promise<NewsItem[]> {
  await simulateNetwork(0.5);
  const now = new Date();
  const items = news
    .filter((item) => !query.activeOnly || !isExpired(item, now))
    .sort(newestFirst)
    .map((item) => ({ ...item }));
  return query.limit === undefined ? items : items.slice(0, query.limit);
}

async function getNews(id: string, _user: User): Promise<NewsItem> {
  await simulateNetwork(0.3);
  return { ...findNews(id) };
}

async function publishNews(input: NewsInput, user: User): Promise<NewsItem> {
  await simulateNetwork();
  assertAdmin(user);
  assertValid(input);
  const { title, body, visibleUntil } = normalizeNews(input);
  const item: NewsItem = {
    id: `n-new-${nextId++}`,
    title,
    body,
    author: user.name,
    // La hora la pone el «servidor», no la app.
    publishedAt: new Date().toISOString(),
    updatedAt: null,
    visibleUntil,
  };
  news = [...news, item];
  notifications = [
    ...notifications,
    ...MEMBER_IDS.filter((id) => id !== user.id).map((recipientId) => ({
      recipientId,
      title: 'Nuevo comunicado',
      message: title,
      newsId: item.id,
    })),
  ];
  return { ...item };
}

async function updateNews(id: string, input: NewsInput, user: User): Promise<NewsItem> {
  await simulateNetwork();
  assertAdmin(user);
  assertValid(input);
  const { title, body, visibleUntil } = normalizeNews(input);
  const updated: NewsItem = { ...findNews(id), title, body, visibleUntil, updatedAt: new Date().toISOString() };
  news = news.map((item) => (item.id === id ? updated : item));
  // El aviso pendiente muestra el título nuevo.
  notifications = notifications.map((item) => (item.newsId === id ? { ...item, message: title } : item));
  return { ...updated };
}

async function deleteNews(id: string, user: User): Promise<void> {
  await simulateNetwork();
  assertAdmin(user);
  findNews(id);
  news = news.filter((item) => item.id !== id);
  notifications = notifications.filter((item) => item.newsId !== id);
}

export const newsBackend = {
  listNews,
  getNews,
  publishNews,
  updateNews,
  deleteNews,
} satisfies NewsBackend;
