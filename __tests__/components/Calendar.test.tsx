import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ComponentProps } from 'react';

import { Calendar, type DateRange } from '@/components/ui/Calendar';

// Se fija la fecha para que el mes mostrado sea siempre septiembre de 2025 (como en el mockup).
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2025, 8, 15));
});
afterEach(() => jest.useRealTimers());

let lastRange: DateRange = { start: null, end: null };

function Harness(props: Pick<ComponentProps<typeof Calendar>, 'mode' | 'isDateDisabled'>) {
  const [range, setRange] = useState<DateRange>({ start: null, end: null });
  lastRange = range;
  return <Calendar value={range} onChange={setRange} {...props} />;
}

const day = (n: number) => screen.getByText(String(n));

describe('Calendar', () => {
  it('muestra el mes actual con sus días', async () => {
    await render(<Harness />);

    expect(screen.getByText('Sep')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
    expect(day(30)).toBeTruthy();
    expect(screen.getByText('Lu')).toBeTruthy();
  });

  it('el primer toque marca el inicio y el segundo el fin del rango', async () => {
    await render(<Harness />);

    await fireEvent.press(day(9));
    expect(lastRange.start).toEqual(new Date(2025, 8, 9));
    expect(lastRange.end).toBeNull();

    await fireEvent.press(day(13));
    expect(lastRange.start).toEqual(new Date(2025, 8, 9));
    expect(lastRange.end).toEqual(new Date(2025, 8, 13));
  });

  it('si el segundo día es anterior al inicio, reinicia el rango', async () => {
    await render(<Harness />);

    await fireEvent.press(day(20));
    await fireEvent.press(day(10));

    expect(lastRange.start).toEqual(new Date(2025, 8, 10));
    expect(lastRange.end).toBeNull();
  });

  it('un tercer toque empieza un rango nuevo', async () => {
    await render(<Harness />);

    await fireEvent.press(day(9));
    await fireEvent.press(day(13));
    await fireEvent.press(day(22));

    expect(lastRange.start).toEqual(new Date(2025, 8, 22));
    expect(lastRange.end).toBeNull();
  });

  it('las flechas cambian de mes y de año', async () => {
    await render(<Harness />);

    await fireEvent.press(screen.getByLabelText('Mes siguiente'));
    expect(screen.getByText('Oct')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Mes siguiente'));
    await fireEvent.press(screen.getByLabelText('Mes siguiente'));
    expect(screen.getByText('Dic')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Mes siguiente'));
    expect(screen.getByText('Ene')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Mes anterior'));
    expect(screen.getByText('Dic')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
  });

  it('los días de otros meses no se pueden seleccionar', async () => {
    await render(<Harness />);

    // Septiembre de 2025 empieza en lunes: el domingo 31 de agosto aparece deshabilitado.
    await fireEvent.press(day(31));
    expect(lastRange.start).toBeNull();
  });

  it('en modo «single» cada toque elige un solo día', async () => {
    await render(<Harness mode="single" />);

    await fireEvent.press(day(9));
    await fireEvent.press(day(13));

    expect(lastRange.start).toEqual(new Date(2025, 8, 13));
    expect(lastRange.end).toBeNull();
  });

  it('no permite elegir los días que isDateDisabled marca (p. ej. fechas futuras)', async () => {
    const today = new Date(2025, 8, 15);
    await render(<Harness mode="single" isDateDisabled={(date) => date > today} />);

    await fireEvent.press(day(20));
    expect(lastRange.start).toBeNull();

    await fireEvent.press(day(15));
    expect(lastRange.start).toEqual(today);
  });
});
