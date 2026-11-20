// Punto de entrada de la administración de usuarios y unidades (RF20): las pantallas importan desde
// aquí. Si la app tiene configurado Supabase (.env.local) usa community.supabase.ts; si no, el
// servicio simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { communityBackend as mockBackend } from '@/services/community.mock';
import { communityBackend as supabaseBackend } from '@/services/community.supabase';
import type { CommunityBackend } from '@/services/community.types';

export {
  CommunityError,
  EMAIL_MAX,
  PERSON_NAME_MAX,
  ROLES_WITH_UNIT,
  UNIT_ADDRESS_MAX,
  UNIT_NAME_MAX,
  type CommunityUnit,
  type Person,
  type PersonErrors,
  type PersonInput,
  type UnitErrors,
  type UnitInput,
} from '@/services/community.types';
export { normalizePerson, normalizeUnit, validatePerson, validateUnit } from '@/services/community.validation';
// Solo para las pruebas y el modo simulado.
export { resetMockCommunityState } from '@/services/community.mock';

const backend: CommunityBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const listUnits: CommunityBackend['listUnits'] = (...args) => backend.listUnits(...args);
export const saveUnit: CommunityBackend['saveUnit'] = (...args) => backend.saveUnit(...args);
export const listPeople: CommunityBackend['listPeople'] = (...args) => backend.listPeople(...args);
export const preregisterPerson: CommunityBackend['preregisterPerson'] = (...args) => backend.preregisterPerson(...args);
export const updatePerson: CommunityBackend['updatePerson'] = (...args) => backend.updatePerson(...args);
export const deletePreregistration: CommunityBackend['deletePreregistration'] = (...args) =>
  backend.deletePreregistration(...args);
