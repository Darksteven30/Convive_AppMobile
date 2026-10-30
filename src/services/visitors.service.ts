// Punto de entrada del registro de visitantes (RF10): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa visitors.supabase.ts; si no, el servicio
// simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { visitorsBackend as mockBackend } from '@/services/visitors.mock';
import { visitorsBackend as supabaseBackend } from '@/services/visitors.supabase';
import type { VisitorsBackend } from '@/services/visitors.types';

export {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_MAX,
  DOCUMENT_TYPES,
  NAME_MAX,
  NAME_MIN,
  PLATE_MAX,
  VisitorError,
  type DocumentType,
  type EntryInput,
  type Unit,
  type Visit,
  type VisitorErrors,
  type VisitorField,
} from '@/services/visitors.types';
export {
  isValidDocument,
  isValidName,
  isValidPlate,
  normalizeDocument,
  normalizeName,
  normalizePlate,
  validateEntry,
} from '@/services/visitors.validation';
// Solo para las pruebas y el modo simulado.
export { MOCK_UNITS, resetMockVisitorsState } from '@/services/visitors.mock';

const backend: VisitorsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const listUnits: VisitorsBackend['listUnits'] = (...args) => backend.listUnits(...args);
export const findVisitorName: VisitorsBackend['findVisitorName'] = (...args) => backend.findVisitorName(...args);
export const listVisitorsInside: VisitorsBackend['listVisitorsInside'] = (...args) =>
  backend.listVisitorsInside(...args);
export const registerEntry: VisitorsBackend['registerEntry'] = (...args) => backend.registerEntry(...args);
export const registerExit: VisitorsBackend['registerExit'] = (...args) => backend.registerExit(...args);
