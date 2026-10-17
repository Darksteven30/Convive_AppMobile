// Reglas de RF05 (matriz 7.1 y especificación 7.2) compartidas por la pantalla y los dos servicios.
// La app valida para guiar al usuario, pero el servidor nunca confía en ella: en Supabase las mismas
// reglas se repiten en crear_reserva(), que además verifica la disponibilidad (RF06).

import { MSG } from '@/constants/messages';
import {
  BOOKING_MONTHS_AHEAD,
  type BusySlot,
  type ReservationErrors,
  type ReservationInput,
  type Zone,
} from '@/services/reservations.types';
import { addMonthsISO, fromISODate, startOfMonthISO, toISODate } from '@/utils/date';

const pad = (value: number) => String(value).padStart(2, '0');

/** 8 → «08:00». */
export function formatHour(hour: number): string {
  return `${pad(hour)}:00`;
}

/** Último día que se puede reservar: fin del tercer mes siguiente al actual. */
export function lastBookableDate(today: string): string {
  const date = fromISODate(addMonthsISO(startOfMonthISO(today), BOOKING_MONTHS_AHEAD + 1));
  date.setDate(0);
  return toISODate(date);
}

const overlaps = (slot: BusySlot, date: string, start: number, end: number) =>
  slot.date === date && slot.start < end && start < slot.end;

/** Si la franja ya empezó o pasó (solo aplica a hoy). */
function hasStarted(date: string, hour: number, now: Date): boolean {
  if (date !== toISODate(now)) return date < toISODate(now);
  return hour * 60 <= now.getHours() * 60 + now.getMinutes();
}

/** Horas de inicio libres del día: bloques de 1 hora dentro del horario de la zona que no han pasado. */
export function freeStartHours(zone: Zone, date: string, busy: BusySlot[], now = new Date()): number[] {
  const hours: number[] = [];
  for (let hour = zone.opensAt; hour < zone.closesAt; hour++) {
    if (!hasStarted(date, hour, now) && !busy.some((slot) => overlaps(slot, date, hour, hour + 1))) {
      hours.push(hour);
    }
  }
  return hours;
}

/** Horas de fin posibles para un inicio: se puede extender mientras las horas sigan libres. */
export function validEndHours(zone: Zone, date: string, start: number, busy: BusySlot[]): number[] {
  const hours: number[] = [];
  for (let hour = start + 1; hour <= zone.closesAt; hour++) {
    if (busy.some((slot) => overlaps(slot, date, hour - 1, hour))) break;
    hours.push(hour);
  }
  return hours;
}

/** Día sin cupo: no queda ninguna franja libre (MSG-RF05-08). */
export function isDayFull(zone: Zone, date: string, busy: BusySlot[], now = new Date()): boolean {
  return freeStartHours(zone, date, busy, now).length === 0;
}

/**
 * Reglas de RF05. Devuelve un mensaje por campo inválido.
 * Sin `zone` (no se conoce el catálogo) solo se valida lo que no depende de la zona; sin `busy`
 * no se verifica la disponibilidad. En ambos casos el servidor valida el resto.
 */
export function validateReservation(
  input: Partial<ReservationInput>,
  zone: Zone | null,
  busy: BusySlot[] | null,
  now = new Date(),
): ReservationErrors {
  const errors: ReservationErrors = {};
  const today = toISODate(now);

  if (!input.zoneId) {
    errors.zoneId = MSG.RF05.zoneRequired;
  }

  if (!input.date || input.date < today || input.date > lastBookableDate(today)) {
    errors.date = MSG.RF05.dateOutOfRange;
  }

  const { start, end } = input;
  if (start == null || end == null) {
    errors.time = MSG.RF05.timeRequired;
  } else if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) {
    errors.time = MSG.RF05.endBeforeStart;
  } else if (zone && (start < zone.opensAt || end > zone.closesAt)) {
    errors.time = MSG.RF05.outsideSchedule(formatHour(zone.opensAt), formatHour(zone.closesAt));
  } else if (input.date && !errors.date && hasStarted(input.date, start, now)) {
    errors.time = MSG.RF05.pastTime;
  } else if (input.date && busy?.some((slot) => overlaps(slot, input.date as string, start, end))) {
    errors.time = MSG.RF05.slotTaken;
  }

  const { attendees } = input;
  if (attendees != null) {
    if (!Number.isInteger(attendees) || attendees < 1) {
      errors.attendees = MSG.RF05.attendeesInvalid;
    } else if (zone && attendees > zone.capacity) {
      errors.attendees = MSG.RF05.overCapacity(zone.name, zone.capacity);
    }
  }
  return errors;
}
