import { screen } from '@testing-library/react-native';

import { press, renderSignedIn } from '../helpers/app';

describe('General (resumen financiero)', () => {
  it('muestra saldo, ingresos, egresos y los gráficos', async () => {
    const app = await renderSignedIn('junta@convive.com', 'Junta123');

    await press(screen.getByText('General'));
    expect(app.getPathname()).toBe('/general');

    expect(screen.getByText('Saldo actual general')).toBeTruthy();
    expect(screen.getAllByText('$10.000.000,00')).toHaveLength(2); // saldo e ingresos
    expect(screen.getByText('$1.000.000,00')).toBeTruthy();
    expect(screen.getByText('Movimiento de fondos')).toBeTruthy();
    expect(screen.getByText('Categorías de gasto')).toBeTruthy();
    expect(screen.getByText('Categorías de PQRS')).toBeTruthy();
    expect(screen.getByText('Categorías de reservas')).toBeTruthy();
  });

  it('la leyenda de la dona calcula los porcentajes', async () => {
    await renderSignedIn('admin@convive.com', 'Admin123');
    await press(screen.getByText('General'));

    expect(screen.getByText('Nómina · 60 %')).toBeTruthy();
    expect(screen.getByText('Salón social · 50 %')).toBeTruthy();
  });
});
