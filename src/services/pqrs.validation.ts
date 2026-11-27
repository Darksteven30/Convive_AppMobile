// Reglas de RF07 y RF08 (matriz 7.1 y especificación 7.2) compartidas por las pantallas y los dos
// servicios. La app valida para guiar al usuario, pero el servidor nunca confía en ella: en Supabase
// las mismas reglas se repiten en radicar_pqrs(), que además lee el formato y el tamaño de cada foto
// en Storage, y en cambiar_estado_pqrs().

import { MSG } from '@/constants/messages';
import {
  COMMENT_MAX,
  COMMENT_MIN,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  NEXT_STATUSES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  PHOTO_MIME_TYPES,
  PQRS_STATUS_LABELS,
  PQRS_TYPES,
  type Photo,
  type PqrsErrors,
  type PqrsInput,
  type StatusChangeInput,
} from '@/services/pqrs.types';

/** Mensaje de una foto que no cumple (MSG-RF07-04 o MSG-RF07-05), o null si sirve. */
export function photoError(photo: Pick<Photo, 'mimeType' | 'size'>): string | null {
  if (!PHOTO_MIME_TYPES.includes(photo.mimeType.toLowerCase())) return MSG.RF07.invalidFormat;
  if (photo.size !== undefined && photo.size > PHOTO_MAX_BYTES) return MSG.RF07.tooLarge;
  return null;
}

/**
 * Reglas de RF08: solo transiciones del flujo (MSG-RF08-03) y comentario de 10 a 500 caracteres,
 * obligatorio al pasar a «Resuelto» (MSG-RF08-02).
 */
export function validateStatusChange(
  input: Partial<Pick<StatusChangeInput, 'currentStatus' | 'status' | 'comment'>>,
): PqrsErrors {
  const errors: PqrsErrors = {};
  const { currentStatus, status } = input;

  if (!status) {
    errors.status = MSG.RF08.statusRequired;
  } else if (!currentStatus || !NEXT_STATUSES[currentStatus].includes(status)) {
    errors.status = MSG.RF08.invalidTransition(
      currentStatus ? PQRS_STATUS_LABELS[currentStatus] : '—',
      PQRS_STATUS_LABELS[status],
    );
  }

  const comment = input.comment?.trim() ?? '';
  if (comment === '') {
    if (status === 'resuelto') errors.comment = MSG.RF08.commentRequired;
  } else if (comment.length < COMMENT_MIN || comment.length > COMMENT_MAX) {
    errors.comment = MSG.RF08.commentLength;
  }
  return errors;
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
