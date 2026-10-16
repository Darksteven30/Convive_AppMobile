// Servicio de reservas simulado (mock) para RF05. Se usa cuando la app no tiene configurado Supabase
// (y siempre en las pruebas). Replica el catálogo de zonas y las reservas de ejemplo de
// supabase/seed.sql, y las validaciones de crear_reserva() en el servidor.

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  ReservationError,
  type BusySlot,
  type Reservation,
  type ReservationInput,
  type ReservationsBackend,
  type Zone,
} from '@/services/reservations.types';
import { validateReservation } from '@/services/reservations.validation';
import { addDaysISO, todayISO } from '@/utils/date';

/** Catálogo de zonas: el mismo del bloque «RF05» de supabase/seed.sql. */
export const MOCK_ZONES: Zone[] = [
  { id: 'zona-salon', name: 'Salón social', opensAt: 8, closesAt: 22, capacity: 50, requiresApproval: true },
  { id: 'zona-cancha', name: 'Cancha', opensAt: 6, closesAt: 22, capacity: 12, requiresApproval: false },
  { id: 'zona-bbq', name: 'BBQ', opensAt: 10, closesAt: 20, capacity: 20, requiresApproval: false },
];

/** Reservas de ejemplo, en días contados desde hoy (como en seed.sql). */
const seedReservations: { zoneId: string; days: number; start: number; end: number }[] = [
  { zoneId: 'zona-cancha', days: 1, start: 8, end: 10 },
  // Torneo: la cancha queda sin cupo ese día.
  { zoneId: 'zona-cancha', days: 3, start: 6, end: 22 },
  { zoneId: 'zona-bbq', days: 1, start: 12, end: 16 },
  { zoneId: 'zona-salon', days: 2, start: 18, end: 22 },
];

let reservations: Reservation[] = [];
let nextId = 1;

/**
 * Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero).
 * Las fechas de ejemplo se calculan desde hoy.
 */
export function resetMockReservationsState() {
  const today = todayISO();
  reservations = seedReservations.map((item, index) => {
    const zone = MOCK_ZONES.find((z) => z.id === item.zoneId) as Zone;
    return {
      id: `r${index + 1}`,
      zoneId: zone.id,
      zoneName: zone.name,
      date: addDaysISO(today, item.days),
      start: item.start,
      end: item.end,
      attendees: null,
      status: zone.requiresApproval ? 'pendiente' : 'confirmada',
    };
  });
  nextId = reservations.length + 1;
}
resetMockReservationsState();

const busyOf = (zoneId: string): BusySlot[] =>
  reservations
    .filter((item) => item.zoneId === zoneId)
    .map(({ date, start, end }) => ({ date, start, end }));

async function listZones(): Promise<Zone[]> {
  await simulateNetwork(0.5);
  return MOCK_ZONES.map((zone) => ({ ...zone }));
}

async function getAvailability(zoneId: string, from: string, to: string): Promise<BusySlot[]> {
  await simulateNetwork(0.5);
  if (!MOCK_ZONES.some((zone) => zone.id === zoneId)) {
    throw new ReservationError('validation');
  }
  return busyOf(zoneId).filter((slot) => slot.date >= from && slot.date <= to);
}

async function createReservation(input: ReservationInput, user: User): Promise<Reservation> {
  await simulateNetwork();
  if (!user.house) {
    throw new ReservationError('forbidden');
  }
  const zone = MOCK_ZONES.find((item) => item.id === input.zoneId);
  if (!zone) {
    throw new ReservationError('validation', { zoneId: MSG.RF05.zoneRequired });
  }
  // La disponibilidad se valida aparte para distinguir «se ocupó mientras reservabas».
  const errors = validateReservation(input, zone, null);
  if (Object.keys(errors).length > 0) {
    throw new ReservationError('validation', errors);
  }
  const taken = validateReservation(input, zone, busyOf(input.zoneId)).time;
  if (taken) {
    throw new ReservationError('unavailable', { time: taken });
  }

  const reservation: Reservation = {
    ...input,
    id: `r${nextId++}`,
    zoneName: zone.name,
    status: zone.requiresApproval ? 'pendiente' : 'confirmada',
  };
  reservations = [...reservations, reservation];
  return reservation;
}

export const reservationsBackend = {
  listZones,
  getAvailability,
  createReservation,
} satisfies ReservationsBackend;
