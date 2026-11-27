// Reglas de RF19 compartidas por la pantalla y los dos servicios. La app valida para guiar al
// administrador, pero el servidor nunca confía en ella: en Supabase las mismas reglas se repiten en
// publicar_noticia() y editar_noticia().

import { MSG } from '@/constants/messages';
import { BODY_MAX, BODY_MIN, TITLE_MAX, TITLE_MIN, type NewsErrors, type NewsInput } from '@/services/news.types';

/** Caracteres visibles, como char_length() de PostgreSQL (un emoji o una tilde cuentan uno). */
export const visibleLength = (text: string) => [...text].length;

/** Sin espacios al inicio ni al final; sin «visible hasta», null (no vence). */
export function normalizeNews(input: NewsInput): Required<NewsInput> {
  return { title: input.title.trim(), body: input.body.trim(), visibleUntil: input.visibleUntil ?? null };
}

export function isValidTitle(title: string): boolean {
  const length = visibleLength(title.trim());
  return length >= TITLE_MIN && length <= TITLE_MAX;
}

export function isValidBody(body: string): boolean {
  const length = visibleLength(body.trim());
  return length >= BODY_MIN && length <= BODY_MAX;
}

/** «Visible hasta» es opcional; si existe, debe ser posterior a este momento. */
export function isValidVisibleUntil(visibleUntil: string | null | undefined, now = new Date()): boolean {
  return !visibleUntil || new Date(visibleUntil).getTime() > now.getTime();
}

/** Reglas de RF19. Devuelve un mensaje por campo inválido. */
export function validateNews(input: Partial<NewsInput>, now = new Date()): NewsErrors {
  const errors: NewsErrors = {};
  if (!isValidTitle(input.title ?? '')) {
    errors.title = MSG.RF19.titleInvalid;
  }
  if (!isValidBody(input.body ?? '')) {
    errors.body = MSG.RF19.bodyInvalid;
  }
  if (!isValidVisibleUntil(input.visibleUntil, now)) {
    errors.visibleUntil = MSG.RF19.visibleUntilPast;
  }
  return errors;
}
