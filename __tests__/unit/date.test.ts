import {
  addMonthsISO,
  formatDate,
  formatDateTime,
  formatMonthYear,
  fromISODate,
  isFutureDate,
  startOfMonthISO,
  toISODate,
  todayISO,
} from '@/utils/date';

describe('utilidades de fecha', () => {
  it('convierte entre Date y «aaaa-mm-dd» en hora local', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(fromISODate('2026-01-05')).toEqual(new Date(2026, 0, 5));
  });

  it('formatea como dd/mm/aaaa', () => {
    expect(formatDate('2026-10-02')).toBe('02/10/2026');
  });

  it('detecta fechas futuras respecto a hoy', () => {
    expect(isFutureDate('2026-10-03', '2026-10-02')).toBe(true);
    expect(isFutureDate('2026-10-02', '2026-10-02')).toBe(false);
    expect(isFutureDate('2025-12-31', '2026-10-02')).toBe(false);
  });

  it('todayISO usa la fecha del dispositivo', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 2, 23, 30));
    expect(todayISO()).toBe('2026-10-02');
    jest.useRealTimers();
  });

  it('primer día del mes (fecha inicial por defecto de RF04)', () => {
    expect(startOfMonthISO('2026-10-15')).toBe('2026-10-01');
    expect(startOfMonthISO('2026-02-28')).toBe('2026-02-01');
  });

  it('suma meses, también cambiando de año', () => {
    expect(addMonthsISO('2026-01-15', 12)).toBe('2027-01-15');
    expect(addMonthsISO('2026-11-30', 2)).toBe('2027-01-30');
    expect(addMonthsISO('2026-10-15', -3)).toBe('2026-07-15');
  });

  it('formatea fecha y hora como en los comprobantes («09 sep 2026 - 06:19 p. m.»)', () => {
    expect(formatDateTime(new Date(2026, 8, 9, 18, 19))).toBe('09 sep 2026 - 06:19 p. m.');
    expect(formatDateTime(new Date(2026, 0, 1, 0, 5))).toBe('01 ene 2026 - 12:05 a. m.');
    expect(formatDateTime(new Date(2026, 0, 1, 12, 0))).toBe('01 ene 2026 - 12:00 p. m.');
  });
});

describe('formatMonthYear', () => {
  it('muestra el periodo del historial de pagos como «mmm aaaa» (RF02)', () => {
    expect(formatMonthYear(new Date(2026, 7, 5))).toBe('Ago 2026');
    expect(formatMonthYear(new Date(2025, 0, 31))).toBe('Ene 2025');
    expect(formatMonthYear(new Date(2026, 11, 1))).toBe('Dic 2026');
  });
});
