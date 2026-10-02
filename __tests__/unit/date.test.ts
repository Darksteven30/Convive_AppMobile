import { formatDate, fromISODate, isFutureDate, toISODate, todayISO } from '@/utils/date';

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
});
