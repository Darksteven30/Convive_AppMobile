// Fechas de calendario (sin hora) como texto ISO «aaaa-mm-dd» en la zona horaria del dispositivo.
// Se comparan como texto porque el formato ISO ordena igual que las fechas.

const pad = (value: number) => String(value).padStart(2, '0');

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromISODate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayISO(): string {
  return toISODate(new Date());
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

/** Suma meses a una fecha; si el día no existe en el mes destino, pasa al siguiente (31 ene + 1 → 3 mar). */
export function addMonthsISO(value: string, months: number): string {
  const date = fromISODate(value);
  date.setMonth(date.getMonth() + months);
  return toISODate(date);
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Periodo del historial de pagos (RF02, «mmm aaaa»): «Ago 2026». */
export function formatMonthYear(date: Date): string {
  const month = MONTHS[date.getMonth()];
  return `${month[0].toUpperCase()}${month.slice(1)} ${date.getFullYear()}`;
}

/** Fecha y hora para comprobantes y reportes: «09 sep 2026 - 06:19 p. m.» (documento, 7.2). */
export function formatDateTime(date: Date): string {
  const hours = date.getHours();
  const suffix = hours < 12 ? 'a. m.' : 'p. m.';
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} - ${pad(hours12)}:${pad(date.getMinutes())} ${suffix}`;
}
