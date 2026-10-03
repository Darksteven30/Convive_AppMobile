// Entrada de montos en pesos colombianos: punto para miles y coma para decimales (documento, 7.2).

/** Máximo permitido en RF03: decimal(18,2) hasta 999.999.999,99. */
export const MAX_AMOUNT = 999_999_999.99;
const MAX_INTEGER_DIGITS = 9;

export type AmountInput = {
  /** Texto formateado para mostrar en el campo, p. ej. «$ 1.250.000,5». */
  text: string;
  /** Valor numérico, o null si el campo está vacío. */
  value: number | null;
};

const withThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/**
 * Formatea lo que el usuario escribe mientras escribe: ignora todo menos dígitos y la coma
 * decimal, limita a 2 decimales y a 9 dígitos enteros (≤ 999.999.999,99).
 */
export function formatAmountInput(raw: string): AmountInput {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const hasComma = cleaned.includes(',');
  const [integerPart = '', ...rest] = cleaned.split(',');
  const decimals = rest.join('').slice(0, 2);
  const integer = integerPart.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS);

  if (!integer && !hasComma) {
    return { text: '', value: null };
  }

  const text = `$ ${withThousands(integer || '0')}${hasComma ? `,${decimals}` : ''}`;
  const value = Number(`${integer || '0'}.${decimals || '0'}`);
  return { text, value };
}

/** Valor inicial de un campo de monto a partir de un número: 10678.9 → «$ 10.678,90». */
export function amountInputFrom(value: number): AmountInput {
  return formatAmountInput(value.toFixed(2).replace('.', ','));
}

/** Formato de lectura con espacio tras el signo, como en el documento: «$ 1.250.000,00». */
export function formatAmount(value: number): string {
  const [integer, decimals] = Math.abs(value).toFixed(2).split('.');
  return `${value < 0 ? '-' : ''}$ ${withThousands(integer)},${decimals}`;
}
