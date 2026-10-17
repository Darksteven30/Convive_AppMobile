import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import {
  MOCK_ZONES,
  ReservationError,
  createReservation,
  formatHour,
  freeStartHours,
  getAvailability,
  isDayFull,
  lastBookableDate,
  listZones,
  resetMockReservationsState,
  validEndHours,
  validateReservation,
  type BusySlot,
  type ReservationInput,
  type Zone,
} from '@/services/reservations.service';

// «Hoy»: jueves 15 de octubre de 2026, 10:30 a. m.
const NOW = new Date(2026, 9, 15, 10, 30);

const resident: User = {
  id: 'u1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
  complex: '',
  role: 'residente',
};

const cancha = MOCK_ZONES.find((zone) => zone.id === 'zona-cancha') as Zone;
const salon = MOCK_ZONES.find((zone) => zone.id === 'zona-salon') as Zone;

const valid: ReservationInput = { zoneId: 'zona-cancha', date: '2026-10-20', start: 10, end: 12, attendees: 8 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  resetMockReservationsState();
});
afterEach(() => jest.useRealTimers());

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectError(promise: Promise<unknown>, code: ReservationError['code'], fieldErrors = {}) {
  const assertion = expect(promise).rejects.toMatchObject({ code, fieldErrors });
  await jest.runAllTimersAsync();
  await assertion;
}

describe('RF05 · reglas', () => {
  it('formatea las horas en bloques de 1 hora', () => {
    expect(formatHour(6)).toBe('06:00');
    expect(formatHour(22)).toBe('22:00');
  });

  it('el último día que se puede reservar es el fin del tercer mes siguiente', () => {
    expect(lastBookableDate('2026-10-15')).toBe('2027-01-31');
    expect(lastBookableDate('2026-11-30')).toBe('2027-02-28');
    expect(lastBookableDate('2026-01-01')).toBe('2026-04-30');
  });

  it('ofrece las horas de inicio libres, dentro del horario y que aún no empiezan', () => {
    const busy: BusySlot[] = [{ date: '2026-10-16', start: 8, end: 10 }];

    expect(freeStartHours(cancha, '2026-10-16', busy, NOW)).toEqual([6, 7, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    // Hoy a las 10:30 la primera franja libre es la de las 11:00.
    expect(freeStartHours(cancha, '2026-10-15', busy, NOW)[0]).toBe(11);
  });

  it('la hora de fin se puede extender hasta la siguiente franja ocupada o el cierre', () => {
    const busy: BusySlot[] = [{ date: '2026-10-16', start: 8, end: 10 }];

    expect(validEndHours(cancha, '2026-10-16', 6, busy)).toEqual([7, 8]);
    expect(validEndHours(cancha, '2026-10-16', 20, busy)).toEqual([21, 22]);
    // Una reserva de otro día no estorba.
    expect(validEndHours(cancha, '2026-10-17', 6, busy)).toHaveLength(16);
  });

  it('un día sin franjas libres no tiene cupo', () => {
    const fullDay: BusySlot[] = [{ date: '2026-10-18', start: 6, end: 22 }];

    expect(isDayFull(cancha, '2026-10-18', fullDay, NOW)).toBe(true);
    expect(isDayFull(cancha, '2026-10-19', fullDay, NOW)).toBe(false);
    expect(isDayFull(cancha, '2026-10-15', [], new Date(2026, 9, 15, 21, 5))).toBe(true);
  });

  it('acepta una reserva válida', () => {
    expect(validateReservation(valid, cancha, [], NOW)).toEqual({});
    expect(validateReservation({ ...valid, attendees: null }, cancha, [], NOW)).toEqual({});
  });

  it('exige zona (MSG-RF05-04) y una fecha desde hoy hasta 3 meses adelante', () => {
    expect(validateReservation({ ...valid, zoneId: '' }, null, null, NOW).zoneId).toBe(MSG.RF05.zoneRequired);
    expect(validateReservation({ ...valid, date: '2026-10-14' }, cancha, [], NOW).date).toBe(MSG.RF05.dateOutOfRange);
    expect(validateReservation({ ...valid, date: '2027-02-01' }, cancha, [], NOW).date).toBe(MSG.RF05.dateOutOfRange);
    expect(validateReservation({ ...valid, date: '2027-01-31' }, cancha, [], NOW).date).toBeUndefined();
  });

  it('valida la franja: completa, fin después de inicio (MSG-RF05-05) y dentro del horario (MSG-RF05-06)', () => {
    expect(validateReservation({ ...valid, end: undefined }, cancha, [], NOW).time).toBe(MSG.RF05.timeRequired);
    expect(validateReservation({ ...valid, start: 12, end: 12 }, cancha, [], NOW).time).toBe(MSG.RF05.endBeforeStart);
    expect(validateReservation({ ...valid, start: 14, end: 12 }, cancha, [], NOW).time).toBe(MSG.RF05.endBeforeStart);
    expect(validateReservation({ ...valid, start: 5, end: 7 }, cancha, [], NOW).time).toBe(
      MSG.RF05.outsideSchedule('06:00', '22:00'),
    );
    expect(validateReservation({ ...valid, start: 21, end: 23 }, salon, [], NOW).time).toBe(
      MSG.RF05.outsideSchedule('08:00', '22:00'),
    );
  });

  it('no permite franjas que ya empezaron ni ocupadas', () => {
    expect(validateReservation({ ...valid, date: '2026-10-15', start: 10, end: 11 }, cancha, [], NOW).time).toBe(
      MSG.RF05.pastTime,
    );
    const busy: BusySlot[] = [{ date: '2026-10-20', start: 11, end: 13 }];
    expect(validateReservation(valid, cancha, busy, NOW).time).toBe(MSG.RF05.slotTaken);
    // Termina justo cuando empieza la otra: no se cruzan.
    expect(validateReservation({ ...valid, start: 9, end: 11 }, cancha, busy, NOW).time).toBeUndefined();
  });

  it('valida los asistentes: al menos 1 y hasta el aforo (MSG-RF05-07)', () => {
    expect(validateReservation({ ...valid, attendees: 0 }, cancha, [], NOW).attendees).toBe(MSG.RF05.attendeesInvalid);
    expect(validateReservation({ ...valid, attendees: 13 }, cancha, [], NOW).attendees).toBe(
      MSG.RF05.overCapacity('Cancha', 12),
    );
    expect(validateReservation({ ...valid, attendees: 12 }, cancha, [], NOW).attendees).toBeUndefined();
  });
});

describe('RF05 · servicio simulado', () => {
  it('lista las zonas del catálogo con su horario, aforo y si requieren aprobación', async () => {
    const zones = await run(listZones());

    expect(zones.map((zone) => zone.name)).toEqual(['Salón social', 'Cancha', 'BBQ']);
    expect(zones[0]).toMatchObject({ opensAt: 8, closesAt: 22, capacity: 50, requiresApproval: true });
  });

  it('devuelve las franjas ocupadas de la zona en el rango pedido', async () => {
    const busy = await run(getAvailability('zona-cancha', '2026-10-15', '2027-01-31'));

    expect(busy).toEqual([
      { date: '2026-10-16', start: 8, end: 10 },
      { date: '2026-10-18', start: 6, end: 22 },
    ]);
    expect(await run(getAvailability('zona-cancha', '2026-10-17', '2026-10-17'))).toEqual([]);
  });

  it('guarda la reserva: confirmada si la zona no requiere aprobación y pendiente si la requiere', async () => {
    const confirmed = await run(createReservation(valid, resident));
    expect(confirmed).toMatchObject({ ...valid, zoneName: 'Cancha', status: 'confirmada' });

    const pending = await run(
      createReservation({ zoneId: 'zona-salon', date: '2026-10-20', start: 18, end: 20, attendees: null }, resident),
    );
    expect(pending).toMatchObject({ zoneName: 'Salón social', status: 'pendiente' });

    const busy = await run(getAvailability('zona-cancha', '2026-10-20', '2026-10-20'));
    expect(busy).toEqual([{ date: '2026-10-20', start: 10, end: 12 }]);
  });

  it('verifica la disponibilidad antes de guardar (RF06)', async () => {
    await run(createReservation(valid, resident));

    await expectError(createReservation({ ...valid, start: 11, end: 13 }, resident), 'unavailable', {
      time: MSG.RF05.slotTaken,
    });
    // La reserva que se cruza no quedó guardada.
    const busy = await run(getAvailability('zona-cancha', '2026-10-20', '2026-10-20'));
    expect(busy).toHaveLength(1);
  });

  it('rechaza datos inválidos con el mensaje de cada campo', async () => {
    await expectError(createReservation({ ...valid, zoneId: 'no-existe' }, resident), 'validation', {
      zoneId: MSG.RF05.zoneRequired,
    });
    await expectError(createReservation({ ...valid, attendees: 13 }, resident), 'validation', {
      attendees: MSG.RF05.overCapacity('Cancha', 12),
    });
    await expectError(createReservation({ ...valid, start: 12, end: 10 }, resident), 'validation', {
      time: MSG.RF05.endBeforeStart,
    });
  });

  it('solo reserva quien tiene una unidad', async () => {
    await expectError(createReservation(valid, { ...resident, house: '' }), 'forbidden');
  });
});
