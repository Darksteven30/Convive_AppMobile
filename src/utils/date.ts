// Fechas de calendario (sin hora) como texto ISO «aaaa-mm-dd». Se comparan como texto porque el
// formato ISO ordena igual que las fechas. «Hoy» es el de Colombia (todayISO), como en el servidor.

const pad = (value: number) => String(value).padStart(2, '0');

/** Colombia está siempre en UTC−5 (no tiene horario de verano). */
const COLOMBIA_OFFSET_MS = -5 * 60 * 60 * 1000;

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Fecha de hoy en Colombia, sin importar la zona horaria del dispositivo (un emulador en UTC, un
 * navegador en otro país…). El servidor usa la misma: (now() at time zone 'America/Bogota')::date.
 * Así, a las 9:00 p. m. de Colombia un dispositivo en UTC no cree que ya es mañana.
 */
export function todayISO(now: Date = new Date()): string {
  const colombia = new Date(now.getTime() + COLOMBIA_OFFSET_MS);
  return `${colombia.getUTCFullYear()}-${pad(colombia.getUTCMonth() + 1)}-${pad(colombia.getUTCDate())}`;
}

/** «2026-10-02» → «02/10/2026» (formato de formularios del documento). */
export function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function isFutureDate(value: string, today = todayISO()): boolean {
  return value > today;
}

/** Primer día del mes de la fecha indicada: «2026-10-15» → «2026-10-01». */
export function startOfMonthISO(value = todayISO()): string {
  return `${value.slice(0, 7)}-01`;
}

/** Suma días a una fecha: «2026-10-31» + 1 → «2026-11-01». */
export function addDaysISO(value: string, days: number): string {
  const date = fromISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/**
 * Suma meses a una fecha. Si el día no existe en el mes destino, queda en el último día de ese mes
 * (31 ene + 1 → 28 feb; 29 feb 2024 + 12 → 28 feb 2025), igual que `fecha + interval 'n months'`
 * en PostgreSQL, para que la app y el servidor apliquen el mismo límite de 12 meses.
 */
export function addMonthsISO(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const target = new Date(year, month - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return toISODate(target);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Mes corto para las gráficas (RF14): «2026-11» → «Nov». */
export function formatShortMonth(month: string): string {
  const name = MONTHS[Number(month.slice(5, 7)) - 1] ?? '';
  return `${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
}

/** Periodo del historial de pagos (RF02, «mmm aaaa»): «Ago 2026». */
export function formatMonthYear(date: Date): string {
  const month = MONTHS[date.getMonth()];
  return `${month[0].toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

/** Hora en formato de 12 horas: «06:19 p. m.» (documento, 7.2). */
export function formatTime(date: Date): string {
  const hours = date.getHours();
  const suffix = hours < 12 ? 'a. m.' : 'p. m.';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hours12)}:${pad(date.getMinutes())} ${suffix}`;
}

/** Fecha y hora para comprobantes y reportes: «09 sep 2026 - 06:19 p. m.» (documento, 7.2). */
export function formatDateTime(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} - ${formatTime(date)}`;
}

/** Fecha «aaaa-mm-dd» a una hora en punto del dispositivo, como instante ISO: («2026-11-09», 6) → «2026-11-09T11:00:00.000Z» en Colombia. */
export function dateAtHourISO(value: string, hour: number): string {
  const date = fromISODate(value);
  date.setHours(hour);
  return date.toISOString();
}
