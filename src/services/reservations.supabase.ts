// Reservas con Supabase (RF05). Cumple el mismo contrato que el servicio simulado
// (reservations.types.ts). El esquema y las funciones están en
// supabase/migrations/20261015000000_reservas.sql: disponibilidad_zona() devuelve las franjas
// ocupadas y crear_reserva() valida, verifica la disponibilidad (RF06) y guarda.
// El conjunto, la unidad y el usuario salen de la sesión en el servidor (auth.uid()).

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import {
  ReservationError,
  type BusySlot,
  type Reservation,
  type ReservationErrors,
  type ReservationInput,
  type ReservationStatus,
  type ReservationsBackend,
  type Zone,
} from '@/services/reservations.types';
import { formatHour, validateReservation } from '@/services/reservations.validation';

/** Fila de la tabla zonas_comunes. Las horas llegan como «08:00:00». */
type ZoneRow = {
  id: string;
  nombre: string;
  hora_apertura: string;
  hora_cierre: string;
  aforo: number;
  requiere_aprobacion: boolean;
  orden: number;
};

/** Fila que devuelve disponibilidad_zona(). */
type BusyRow = { fecha: string; hora_inicio: string; hora_fin: string };

/** Fila que devuelve crear_reserva(). */
type CreatedRow = { id: string; estado: ReservationStatus; zona: string };

type RpcError = { message?: string; details?: string | null };

/** «08:00:00» → 8. */
const toHour = (value: string) => Number(value.slice(0, 2));

const toZone = (row: ZoneRow): Zone => ({
  id: row.id,
  name: row.nombre,
  opensAt: toHour(row.hora_apertura),
  closesAt: toHour(row.hora_cierre),
  capacity: row.aforo,
  requiresApproval: row.requiere_aprobacion,
});

/** Traduce los errores de crear_reserva() al mensaje del campo correspondiente. */
function toReservationError(error: RpcError): ReservationError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new ReservationError('forbidden');
  if (message.includes('sin_disponibilidad')) {
    return new ReservationError('unavailable', { time: MSG.RF05.slotTaken });
  }
  // fuera_de_horario y aforo_excedido traen en el detalle los datos de la zona: «08:00|22:00» y «Cancha|12».
  const [first = '', second = ''] = (error.details ?? '').split('|');
  const fields: [string, keyof ReservationErrors, string][] = [
    ['zona_invalida', 'zoneId', MSG.RF05.zoneRequired],
    ['fecha_invalida', 'date', MSG.RF05.dateOutOfRange],
    ['horario_invalido', 'time', MSG.RF05.endBeforeStart],
    ['hora_pasada', 'time', MSG.RF05.pastTime],
    ['fuera_de_horario', 'time', MSG.RF05.outsideSchedule(first, second)],
    ['asistentes_invalidos', 'attendees', MSG.RF05.attendeesInvalid],
    ['aforo_excedido', 'attendees', MSG.RF05.overCapacity(first, Number(second))],
  ];
  const match = fields.find(([code]) => message.includes(code));
  return match ? new ReservationError('validation', { [match[1]]: match[2] }) : null;
}

async function listZones(): Promise<Zone[]> {
  const { data, error } = await getSupabase()
    .from('zonas_comunes')
    .select('id, nombre, hora_apertura, hora_cierre, aforo, requiere_aprobacion, orden')
    .eq('activa', true);
  if (error) throw error;
  return ((data ?? []) as ZoneRow[])
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'))
    .map(toZone);
}

async function getAvailability(zoneId: string, from: string, to: string): Promise<BusySlot[]> {
  const { data, error } = await getSupabase().rpc('disponibilidad_zona', {
    p_zona_id: zoneId,
    p_desde: from,
    p_hasta: to,
  });
  if (error) throw error;
  return ((data ?? []) as BusyRow[]).map((row) => ({
    date: row.fecha,
    start: toHour(row.hora_inicio),
    end: toHour(row.hora_fin),
  }));
}

async function createReservation(input: ReservationInput, _user: User): Promise<Reservation> {
  // El horario, el aforo y la disponibilidad los valida el servidor contra la zona.
  const errors = validateReservation(input, null, null);
  if (Object.keys(errors).length > 0) {
    throw new ReservationError('validation', errors);
  }

  const { data, error } = await getSupabase()
    .rpc('crear_reserva', {
      p_zona_id: input.zoneId,
      p_fecha: input.date,
      p_hora_inicio: formatHour(input.start),
      p_hora_fin: formatHour(input.end),
      p_asistentes: input.attendees,
    })
    .maybeSingle();

  if (error || !data) {
    throw (error && toReservationError(error)) ?? error ?? new Error('sin_respuesta');
  }

  const row = data as CreatedRow;
  return { ...input, id: row.id, zoneName: row.zona, status: row.estado };
}

export const reservationsBackend = {
  listZones,
  getAvailability,
  createReservation,
} satisfies ReservationsBackend;
