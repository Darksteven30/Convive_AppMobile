import { formatCurrency } from '@/utils/format';

describe('formatCurrency', () => {
  it('usa punto para miles y coma para decimales', () => {
    expect(formatCurrency(45678.9)).toBe('$45.678,90');
  });

  it('formatea millones', () => {
    expect(formatCurrency(10000000)).toBe('$10.000.000,00');
  });

  it('formatea valores pequeños sin separador de miles', () => {
    expect(formatCurrency(0)).toBe('$0,00');
    expect(formatCurrency(999.5)).toBe('$999,50');
  });

  it('antepone el signo a los valores negativos', () => {
    expect(formatCurrency(-1500)).toBe('-$1.500,00');
  });

  it('redondea a dos decimales', () => {
    expect(formatCurrency(2.499)).toBe('$2,50');
  });
});
