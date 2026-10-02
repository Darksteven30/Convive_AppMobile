import { formatAmount, formatAmountInput } from '@/utils/money';

describe('formatAmountInput', () => {
  it.each([
    ['', '', null],
    ['1250000', '$ 1.250.000', 1250000],
    ['$ 1.250.000', '$ 1.250.000', 1250000],
    ['1250000,5', '$ 1.250.000,5', 1250000.5],
    ['45678,90', '$ 45.678,90', 45678.9],
    ['12,', '$ 12,', 12],
    [',5', '$ 0,5', 0.5],
    ['0', '$ 0', 0],
    ['007', '$ 7', 7],
  ])('«%s» → «%s» (%s)', (raw, text, value) => {
    expect(formatAmountInput(raw)).toEqual({ text, value });
  });

  it('ignora letras y símbolos', () => {
    expect(formatAmountInput('1a2b3$')).toEqual({ text: '$ 123', value: 123 });
  });

  it('limita a dos decimales', () => {
    expect(formatAmountInput('10,999').value).toBe(10.99);
  });

  it('limita a 9 dígitos enteros (máximo $ 999.999.999,99)', () => {
    expect(formatAmountInput('99999999999,99')).toEqual({ text: '$ 999.999.999,99', value: 999999999.99 });
  });
});

describe('formatAmount', () => {
  it('usa el formato del documento con espacio tras el signo', () => {
    expect(formatAmount(1250000)).toBe('$ 1.250.000,00');
    expect(formatAmount(45678.9)).toBe('$ 45.678,90');
    expect(formatAmount(-1500)).toBe('-$ 1.500,00');
  });
});
