// Punto de entrada de las PQRS y reportes de daño (RF07): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa pqrs.supabase.ts; si no, el servicio
// simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { pqrsBackend as mockBackend } from '@/services/pqrs.mock';
import { pqrsBackend as supabaseBackend } from '@/services/pqrs.supabase';
import type { PqrsBackend } from '@/services/pqrs.types';

export {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_COUNT,
  PHOTO_MIME_TYPES,
  PQRS_STATUS_LABELS,
  PQRS_TYPES,
  PqrsError,
  formatPqrsNumber,
  pqrsTypeLabel,
  type Photo,
  type PqrsDetail,
  type PqrsErrors,
  type PqrsField,
  type PqrsInput,
  type PqrsResponse,
  type PqrsStatus,
  type PqrsSummary,
  type PqrsType,
} from '@/services/pqrs.types';
export { photoError, validatePqrs } from '@/services/pqrs.validation';
// Solo para las pruebas y el modo simulado.
export { mockAdminNotifications, resetMockPqrsState } from '@/services/pqrs.mock';

const backend: PqrsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const listMyPqrs: PqrsBackend['listMyPqrs'] = (...args) => backend.listMyPqrs(...args);
export const getPqrsDetail: PqrsBackend['getPqrsDetail'] = (...args) => backend.getPqrsDetail(...args);
export const createPqrs: PqrsBackend['createPqrs'] = (...args) => backend.createPqrs(...args);
