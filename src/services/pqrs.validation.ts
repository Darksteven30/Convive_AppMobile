// Reglas de RF07 (matriz 7.1 y especificación 7.2) compartidas por la pantalla y los dos servicios.
// La app valida para guiar al usuario, pero el servidor nunca confía en ella: en Supabase las mismas
// reglas se repiten en radicar_pqrs(), que además lee el formato y el tamaño de cada foto en Storage.

import { MSG } from '@/constants/messages';
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  PHOTO_MIME_TYPES,
  PQRS_TYPES,
  type Photo,
  type PqrsErrors,
  type PqrsInput,
} from '@/services/pqrs.types';

/** Mensaje de una foto que no cumple (MSG-RF07-04 o MSG-RF07-05), o null si sirve. */
export function photoError(photo: Pick<Photo, 'mimeType' | 'size'>): string | null {
  if (!PHOTO_MIME_TYPES.includes(photo.mimeType.toLowerCase())) return MSG.RF07.invalidFormat;
  if (photo.size !== undefined && photo.size > PHOTO_MAX_BYTES) return MSG.RF07.tooLarge;
  return null;
}

/** Reglas de RF07. Devuelve un mensaje por campo inválido. */
export function validatePqrs(input: Partial<PqrsInput>): PqrsErrors {
  const errors: PqrsErrors = {};

  if (!input.type || !PQRS_TYPES.some((item) => item.value === input.type)) {
    errors.type = MSG.RF07.typeRequired;
  }

  const description = input.description?.trim() ?? '';
  if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    errors.description = MSG.RF07.descriptionShort;
  }

  const photos = input.photos ?? [];
  const invalid = photos.map(photoError).find(Boolean);
  if (invalid) {
    errors.photos = invalid;
  } else if (photos.length > PHOTO_MAX_COUNT) {
    errors.photos = MSG.RF07.tooManyPhotos;
  } else if (input.type === 'reporte_dano' && photos.length === 0) {
    errors.photos = MSG.RF07.photoRequired;
  }
  return errors;
}
