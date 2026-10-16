// Punto de entrada de las reservas de zonas comunes (RF05): las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa reservations.supabase.ts; si no, el
// servicio simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { reservationsBackend as mockBackend } from '@/services/reservations.mock';
import { reservationsBackend as supabaseBackend } from '@/services/reservations.supabase';
import type { ReservationsBackend } from '@/services/reservations.types';

export {
  BOOKING_MONTHS_AHEAD,
  ReservationError,
  type BusySlot,
  type Reservation,
  type ReservationErrors,
  type ReservationField,
  type ReservationInput,
  type ReservationStatus,
  type Zone,
} from '@/services/reservations.types';
export {
  formatHour,
  freeStartHours,
  isDayFull,
  lastBookableDate,
  validEndHours,
  validateReservation,
} from '@/services/reservations.validation';
// Solo para las pruebas y el modo simulado.
export { MOCK_ZONES, resetMockReservationsState } from '@/services/reservations.mock';

const backend: ReservationsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

export const listZones: ReservationsBackend['listZones'] = (...args) => backend.listZones(...args);
export const getAvailability: ReservationsBackend['getAvailability'] = (...args) =>
  backend.getAvailability(...args);
export const createReservation: ReservationsBackend['createReservation'] = (...args) =>
  backend.createReservation(...args);
