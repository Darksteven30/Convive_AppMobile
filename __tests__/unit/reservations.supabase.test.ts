import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { reservationsBackend as supabaseReservations } from '@/services/reservations.supabase';
import type { ReservationInput } from '@/services/reservations.types';

// Cliente de Supabase simulado: se verifica cómo el servicio traduce las respuestas y los errores
// de la base de datos (supabase/migrations/20261015000000_reservas.sql) al contrato de la app.
type Result = { data: unknown; error: unknown };

let rpcResults: Record<string, Result> = {};
let tableResults: Record<string, Result> = {};

const single = (result: Result) => ({
  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
  error: result.error,
});

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  const result = rpcResults[name] ?? { data: null, error: null };
  // Como supabase-js: la llamada se puede esperar directamente o con .maybeSingle().
  return Object.assign(Promise.resolve(result), { maybeSingle: async () => single(result) });
});

// Tablas: from → select → eq → await.
const mockEq = jest.fn();
const mockFrom = jest.fn((table: string) => {
  const result = tableResults[table] ?? { data: [], error: null };
  const query = {
    select: (_columns: string) => query,
    eq: (column: string, value: unknown) => {
      mockEq(table, column, value);
      return query;
    },
    then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
});

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc, from: mockFrom }),
}));

const resident: User = {
  id: 'p-56',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role: 'residente',
};

const valid: ReservationInput = { zoneId: 'zona-uuid', date: '2026-10-20', start: 10, end: 12, attendees: 8 };

beforeEach(() => {
  jest.clearAllMocks();
  rpcResults = {};
  tableResults = {};
});

describe('Reservas con Supabase · zonas y disponibilidad', () => {
  it('pide las zonas activas y las ordena como el catálogo, con las horas como números', async () => {
    tableResults.zonas_comunes = {
      data: [
        { id: 'z3', nombre: 'BBQ', hora_apertura: '10:00:00', hora_cierre: '20:00:00', aforo: 20, requiere_aprobacion: false, orden: 3 },
        { id: 'z1', nombre: 'Salón social', hora_apertura: '08:00:00', hora_cierre: '22:00:00', aforo: 50, requiere_aprobacion: true, orden: 1 },
        { id: 'z2', nombre: 'Cancha', hora_apertura: '06:00:00', hora_cierre: '22:00:00', aforo: 12, requiere_aprobacion: false, orden: 2 },
      ],
      error: null,
    };

    const zones = await supabaseReservations.listZones();

    expect(mockFrom).toHaveBeenCalledWith('zonas_comunes');
    expect(mockEq).toHaveBeenCalledWith('zonas_comunes', 'activa', true);
    expect(zones.map((zone) => zone.name)).toEqual(['Salón social', 'Cancha', 'BBQ']);
    expect(zones[0]).toEqual({
      id: 'z1',
      name: 'Salón social',
      opensAt: 8,
      closesAt: 22,
      capacity: 50,
      requiresApproval: true,
    });
  });

  it('consulta disponibilidad_zona() y convierte las franjas ocupadas', async () => {
    rpcResults.disponibilidad_zona = {
      data: [
        { fecha: '2026-10-16', hora_inicio: '08:00:00', hora_fin: '10:00:00' },
        { fecha: '2026-10-18', hora_inicio: '06:00:00', hora_fin: '22:00:00' },
      ],
      error: null,
    };

    const busy = await supabaseReservations.getAvailability('zona-uuid', '2026-10-15', '2027-01-31');

    expect(mockRpc).toHaveBeenCalledWith('disponibilidad_zona', {
      p_zona_id: 'zona-uuid',
      p_desde: '2026-10-15',
      p_hasta: '2027-01-31',
    });
    expect(busy).toEqual([
      { date: '2026-10-16', start: 8, end: 10 },
      { date: '2026-10-18', start: 6, end: 22 },
    ]);
  });

  it('si la consulta falla, propaga el error', async () => {
    rpcResults.disponibilidad_zona = { data: null, error: { message: 'zona_invalida' } };

    await expect(supabaseReservations.getAvailability('otra', '2026-10-15', '2027-01-31')).rejects.toEqual({
      message: 'zona_invalida',
    });
  });
});

describe('Reservas con Supabase · crear la reserva', () => {
  it('envía la franja como horas «HH:00» y devuelve el estado que decide el servidor', async () => {
    rpcResults.crear_reserva = { data: [{ id: 'res-1', estado: 'pendiente', zona: 'Salón social' }], error: null };

    const reservation = await supabaseReservations.createReservation(valid, resident);

    expect(mockRpc).toHaveBeenCalledWith('crear_reserva', {
      p_zona_id: 'zona-uuid',
      p_fecha: '2026-10-20',
      p_hora_inicio: '10:00',
      p_hora_fin: '12:00',
      p_asistentes: 8,
    });
    expect(reservation).toEqual({ ...valid, id: 'res-1', zoneName: 'Salón social', status: 'pendiente' });
  });

  it('no llama al servidor si la franja no es válida', async () => {
    await expect(supabaseReservations.createReservation({ ...valid, start: 12, end: 10 }, resident)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { time: MSG.RF05.endBeforeStart },
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    ['sin_disponibilidad', null, 'unavailable', { time: MSG.RF05.slotTaken }],
    ['zona_invalida', null, 'validation', { zoneId: MSG.RF05.zoneRequired }],
    ['fecha_invalida', null, 'validation', { date: MSG.RF05.dateOutOfRange }],
    ['horario_invalido', null, 'validation', { time: MSG.RF05.endBeforeStart }],
    ['hora_pasada', null, 'validation', { time: MSG.RF05.pastTime }],
    ['fuera_de_horario', '10:00|20:00', 'validation', { time: MSG.RF05.outsideSchedule('10:00', '20:00') }],
    ['asistentes_invalidos', null, 'validation', { attendees: MSG.RF05.attendeesInvalid }],
    ['aforo_excedido', 'Cancha|12', 'validation', { attendees: MSG.RF05.overCapacity('Cancha', 12) }],
    ['sin_permiso', null, 'forbidden', {}],
  ])('traduce el error %s del servidor', async (message, details, code, fieldErrors) => {
    rpcResults.crear_reserva = { data: null, error: { message, details } };

    await expect(supabaseReservations.createReservation(valid, resident)).rejects.toMatchObject({ code, fieldErrors });
  });

  it('un error desconocido se propaga tal cual', async () => {
    const error = { message: 'connection lost' };
    rpcResults.crear_reserva = { data: null, error };

    await expect(supabaseReservations.createReservation(valid, resident)).rejects.toBe(error);
  });
});
