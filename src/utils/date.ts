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
