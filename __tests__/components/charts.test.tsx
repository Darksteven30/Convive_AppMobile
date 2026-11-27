import { fireEvent, render, screen } from '@testing-library/react-native';

import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { formatAmount, formatCompactAmount } from '@/utils/money';

describe('BarChart (RF14)', () => {
  const data = [
    { label: 'Ago', income: 8_750_000, expenses: 5_300_000 },
    { label: 'Sep', income: 8_580_000, expenses: 1_250_000 },
  ];

  it('al tocar una barra muestra su valor exacto y al tocarla otra vez lo oculta', async () => {
    await render(<BarChart data={data} />);
    expect(screen.getByText('Toca una barra para ver su valor.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Egresos de Ago: $ 5.300.000,00' }));
    expect(screen.getByText('Ago · Egresos: $ 5.300.000,00')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Ingresos de Sep: $ 8.580.000,00' }));
    expect(screen.getByText('Sep · Ingresos: $ 8.580.000,00')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Ingresos de Sep: $ 8.580.000,00' }));
    expect(screen.getByText('Toca una barra para ver su valor.')).toBeTruthy();
  });
});

describe('DonutChart (RF14)', () => {
  const data = [
    { label: 'Nómina', value: 3_200_000, color: '#1E3A8A' },
    { label: 'Vigilancia', value: 2_100_000, color: '#38BDF8' },
  ];

  it('muestra el total en el centro y el porcentaje de cada categoría en la leyenda', async () => {
    await render(<DonutChart data={data} formatValue={formatAmount} centerLabel="$ 5,3 M" />);

    expect(screen.getByText('$ 5,3 M')).toBeTruthy();
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('Nómina · 60 %')).toBeTruthy();
    expect(screen.getByText('Vigilancia · 40 %')).toBeTruthy();
  });

  it('al tocar una categoría muestra su nombre, valor y porcentaje', async () => {
    await render(<DonutChart data={data} formatValue={formatAmount} />);
    expect(screen.getByText('Toca un segmento para ver su valor.')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Vigilancia: $ 2.100.000,00, 40 %' }));
    expect(screen.getByText('Vigilancia: $ 2.100.000,00 · 40 %')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Vigilancia: $ 2.100.000,00, 40 %' }));
    expect(screen.getByText('Toca un segmento para ver su valor.')).toBeTruthy();
  });

  it('sin formato, muestra el valor como número (p. ej. cantidades de PQRS)', async () => {
    await render(<DonutChart data={[{ label: 'Queja', value: 2, color: '#1E3A8A' }]} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Queja: 2, 100 %' }));
    expect(screen.getByText('Queja: 2 · 100 %')).toBeTruthy();
  });
});

describe('formatCompactAmount', () => {
  it.each([
    [4_450_000, '$ 4,5 M'],
    [12_000_000, '$ 12 M'],
    [450_000, '$ 450 mil'],
    [1_500, '$ 1,5 mil'],
    [980, '$ 980'],
    [0, '$ 0'],
    [-2_000_000, '-$ 2 M'],
  ])('%s → %s', (value, text) => {
    expect(formatCompactAmount(value)).toBe(text);
  });
});
