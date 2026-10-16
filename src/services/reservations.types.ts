// Tipos y contrato común de las reservas de zonas comunes (RF05). Lo cumplen el servicio simulado
// (reservations.mock.ts) y el de Supabase (reservations.supabase.ts); las pantallas solo conocen
// este contrato vía reservations.service.ts.

import type { User } from '@/services/auth.types';

/** Zona común del catálogo del conjunto. Las horas son enteras (bloques de 1 hora, 0–24). */
export type Zone = {
  id: string;
  name: string;
  /** Primera hora en que se puede empezar a usar la zona, p. ej. 8 = 08:00. */
  opensAt: number;
  /** Hora en que la zona cierra, p. ej. 22 = 22:00. */
  closesAt: number;
  /** Aforo máximo de personas. */
  capacity: number;
  /** Si la reserva queda pendiente hasta que la administración la apruebe. */
  requiresApproval: boolean;
};

/** Franja ocupada de una zona (reserva confirmada o pendiente de aprobación). */
export type BusySlot = {
  /** Fecha «aaaa-mm-dd». */
  date: string;
  start: number;
  end: number;
};

export type ReservationInput = {
  zoneId: string;
  /** Fecha «aaaa-mm-dd». */
  date: string;
  start: number;
  end: number;
  /** Número de asistentes (opcional). */
  attendees: number | null;
};

export type ReservationStatus = 'confirmada' | 'pendiente';

export type Reservation = ReservationInput & {
  id: string;
  zoneName: string;
  status: ReservationStatus;
};

/** Meses hacia adelante que se pueden reservar, además del actual. */
export const BOOKING_MONTHS_AHEAD = 3;

export type ReservationField = 'zoneId' | 'date' | 'time' | 'attendees';
export type ReservationErrors = Partial<Record<ReservationField, string>>;

/**
 * Error del servicio. «unavailable»: la franja o el día se ocuparon mientras se reservaba
 * (lo detecta el servidor, RF06). fieldErrors trae un mensaje por campo inválido.
 */
export class ReservationError extends Error {
  constructor(
    public readonly code: 'forbidden' | 'validation' | 'unavailable',
    public readonly fieldErrors: ReservationErrors = {},
  ) {
    super(code);
    this.name = 'ReservationError';
  }
}

/** Funciones que debe ofrecer cada implementación de reservas. */
export type ReservationsBackend = {
  /** Zonas activas del conjunto, en el orden del catálogo. */
  listZones(): Promise<Zone[]>;
  /** Franjas ocupadas de la zona entre dos fechas «aaaa-mm-dd» (incluidas). */
  getAvailability(zoneId: string, from: string, to: string): Promise<BusySlot[]>;
  /** Valida la disponibilidad en el servidor y guarda la reserva. Falla con ReservationError. */
  createReservation(input: ReservationInput, user: User): Promise<Reservation>;
};
