import { fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import { summaryBackend } from '@/services/summary.mock';

import { navigate, press, renderSignedIn } from '../helpers/app';

// «Hoy» fijo: 20 de septiembre de 2026. Con los movimientos simulados (julio a octubre), «Este mes»
// va del 1 al 20 de septiembre: ingresos 8.400.000 + 180.000, egresos 1.250.000 (Mantenimiento).
// Saldo actual (todo hasta hoy): ingresos 25.580.000 − egresos 10.730.000 = 14.850.000.
const TODAY = new Date(2026, 8, 20, 10, 30);

async function openGeneral(email: string, password: string) {
  const app = await renderSignedIn(email, password);
  jest.setSystemTime(TODAY);
  await press(screen.getByText('General'));
  expect(app.getPathname()).toBe('/general');
  return app;
}

async function choosePeriod(label: string) {
  await press(screen.getByRole('button', { name: 'Periodo' }));
  await press(screen.getByText(label));
}

afterEach(() => jest.restoreAllMocks());

describe('RF14 · Resumen financiero (General)', () => {
  it('muestra el saldo actual, los totales de «Este mes» y las cuatro gráficas con datos reales', async () => {
    // El administrador entra por el Panel (la junta abre General al iniciar sesión, antes de fijar «hoy»).
    await openGeneral('admin@convive.com', 'Admin123');

    expect(screen.getByText('Saldo actual general')).toBeTruthy();
    expect(screen.getByText('$ 14.850.000,00')).toBeTruthy();
    expect(screen.getByText('$ 8.580.000,00')).toBeTruthy(); // ingresos
    expect(screen.getByText('$ 1.250.000,00')).toBeTruthy(); // egresos

    expect(screen.getByText('Movimiento de fondos')).toBeTruthy();
    expect(screen.getByText('Sep')).toBeTruthy();
    expect(screen.getByText('Mantenimiento · 100 %')).toBeTruthy();
    // La queja del 17 de septiembre, en proceso.
    expect(screen.getByText('Queja · 100 %')).toBeTruthy();
    expect(screen.getByText('En proceso: 1')).toBeTruthy();
    // Reservas hechas en el periodo: Cancha 2, BBQ 1 y Salón social 1.
    expect(screen.getByText('Cancha · 50 %')).toBeTruthy();
  });

  it('al cambiar el periodo recarga los totales y las gráficas (el saldo no cambia)', async () => {
    await openGeneral('admin@convive.com', 'Admin123');

    await choosePeriod('Mes anterior');

    // Agosto: ingresos 8.300.000 + 450.000; egresos 3.200.000 (Nómina) + 2.100.000 (Vigilancia).
    expect(screen.getByText('$ 14.850.000,00')).toBeTruthy();
    expect(screen.getByText('$ 8.750.000,00')).toBeTruthy();
    expect(screen.getByText('$ 5.300.000,00')).toBeTruthy();
    expect(screen.getByText('Nómina · 60 %')).toBeTruthy();
    expect(screen.getByText('Reclamo · 100 %')).toBeTruthy();
    // Las reservas simuladas se hicieron hoy: en agosto no hay.
    expect(screen.getByText(MSG.RF14.noReservations)).toBeTruthy();
  });

  it('«Últimos 3 meses» muestra una barra por mes, de julio a septiembre', async () => {
    await openGeneral('admin@convive.com', 'Admin123');

    await choosePeriod('Últimos 3 meses');

    expect(screen.getByText('Jul')).toBeTruthy();
    expect(screen.getByText('Ago')).toBeTruthy();
    expect(screen.getByText('Sep')).toBeTruthy();
  });

  it('MSG-RF14-01: sin movimientos en el periodo muestra el estado vacío en lugar de las gráficas', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');
    // Noviembre: los movimientos simulados llegan hasta octubre.
    jest.setSystemTime(new Date(2026, 10, 20, 10, 30));
    await press(screen.getByText('General'));
    expect(app.getPathname()).toBe('/general');

    expect(screen.getAllByText(MSG.RF14.noMovements)).toHaveLength(2); // movimiento de fondos y gastos
    expect(screen.getByText(MSG.RF14.noPqrs)).toBeTruthy();
  });

  it('«Personalizado» muestra la fecha inicial y la final', async () => {
    await openGeneral('admin@convive.com', 'Admin123');

    await choosePeriod('Personalizado');

    expect(screen.getByRole('button', { name: 'Fecha inicial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fecha final' })).toBeTruthy();
  });

  it('MSG-RF14-03: si no se puede cargar, ofrece «Reintentar»', async () => {
    const getSummary = jest.spyOn(summaryBackend, 'getSummary').mockRejectedValueOnce(new Error('sin conexión'));
    await openGeneral('admin@convive.com', 'Admin123');

    expect(screen.getByText(MSG.RF14.loadFailed)).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Reintentar' }));

    expect(getSummary).toHaveBeenCalledTimes(2);
    expect(screen.getByText('$ 14.850.000,00')).toBeTruthy();
  });

  it('el residente lo consulta en solo lectura, sin acceso a los reportes', async () => {
    await openGeneral('monica@gmail.com', 'Residente123');

    expect(screen.getByText('Resumen financiero')).toBeTruthy();
    expect(screen.getByText('$ 14.850.000,00')).toBeTruthy();
    expect(screen.queryByText('Ver reportes financieros')).toBeNull();
  });

  it('el saldo inicial que define el administrador en Finanzas se suma al saldo actual', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');
    jest.setSystemTime(TODAY);
    await navigate('/finanzas');
    expect(app.getPathname()).toBe('/finanzas');

    expect(screen.getByText('Saldo inicial del conjunto')).toBeTruthy();
    expect(screen.getByText('$ 0,00')).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Editar' }));
    await fireEvent.changeText(screen.getByLabelText('Saldo inicial'), '2000000');
    await press(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText(MSG.RF14.initialBalanceSaved)).toBeTruthy();
    expect(screen.getByText('$ 2.000.000,00')).toBeTruthy();

    await navigate('/general');

    expect(screen.getByText('$ 16.850.000,00')).toBeTruthy();
  });
});
