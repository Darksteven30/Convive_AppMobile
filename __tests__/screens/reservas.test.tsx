import { screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { press, renderSignedIn } from '../helpers/app';

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

// Días 15 y 18: aparecen una sola vez en cualquier mes (no se repiten con días de meses vecinos).
const formatted = (day: number) => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), day).toLocaleDateString('es-CO');
};

async function openReservas() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  await press(screen.getByText('Reservar zona'));
  expect(app.getPathname()).toBe('/reservas');
}

describe('Reservas', () => {
  it('pide elegir una fecha antes de agendar', async () => {
    await openReservas();

    await press(screen.getByText('Agendar reserva'));
    expect(alertSpy).toHaveBeenCalledWith('Reserva', 'Selecciona al menos una fecha en el calendario.');
  });

  it('agenda la zona elegida en un solo día', async () => {
    await openReservas();

    await press(screen.getByText('Cancha'));
    await press(screen.getByText('15'));
    await press(screen.getByText('Agendar reserva'));

    expect(alertSpy).toHaveBeenCalledWith('Reserva agendada', `Cancha el ${formatted(15)}.`);
  });

  it('agenda un rango de fechas', async () => {
    await openReservas();

    await press(screen.getByText('BBq'));
    await press(screen.getByText('15'));
    await press(screen.getByText('18'));
    await press(screen.getByText('Agendar reserva'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Reserva agendada',
      `BBq del ${formatted(15)} al ${formatted(18)}.`,
    );
  });
});
