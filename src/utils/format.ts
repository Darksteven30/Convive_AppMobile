/**
 * Formatea un valor en pesos colombianos: 45678.9 -> "$45.678,90".
 * Se implementa a mano para no depender del soporte de Intl en cada motor JS.
 */
export function formatCurrency(value: number): string {
  const [integer, decimals] = Math.abs(value).toFixed(2).split('.');
  const withThousands = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${value < 0 ? '-' : ''}$${withThousands},${decimals}`;
}
