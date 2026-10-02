import { screen } from '@testing-library/react-native';

import { press, renderSignedIn } from '../helpers/app';

const continuar = () => screen.getByRole('button', { name: 'Continuar' });

describe('Flujo de pago', () => {
  it('completa el pago: concepto → medio de pago → confirmación', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByText('Abonar'));
    expect(app.getPathname()).toBe('/pago/seleccion');
    expect(screen.getByText('Efectuar pago')).toBeTruthy();

    // Paso 1: no se puede continuar sin elegir concepto.
    expect(continuar()).toBeDisabled();
    await press(screen.getByText('Cuota extraordinaria'));
    expect(continuar()).toBeEnabled();
    await press(continuar());

    // Paso 2: resumen del concepto elegido y medio de pago.
    expect(app.getPathname()).toBe('/pago/aplicar');
    expect(screen.getByText('Cuota extraordinaria')).toBeTruthy();
    expect(screen.getByText('$45.678,90')).toBeTruthy();
    expect(continuar()).toBeDisabled();
    await press(screen.getByText('Nequi / Daviplata'));
    await press(continuar());

    // Paso 3: comprobante con los datos del pago.
    expect(app.getPathname()).toBe('/pago/confirmacion');
    expect(screen.getByText('Pago exitoso')).toBeTruthy();
    expect(screen.getByText('Cuota extraordinaria')).toBeTruthy();
    expect(screen.getByText('Nequi / Daviplata')).toBeTruthy();
    expect(screen.getByText(/^#\d{8}$/)).toBeTruthy();

    await press(screen.getByText('Volver al inicio'));
    expect(app.getPathname()).toBe('/inicio');
  });

  it('"Cancelar" abandona el pago y vuelve al inicio', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');

    await press(screen.getByText('Abonar'));
    await press(screen.getByText('Cuota administración'));
    await press(continuar());
    expect(app.getPathname()).toBe('/pago/aplicar');

    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/inicio');
  });

  it('la sección Pagos muestra el historial', async () => {
    await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByText('Pagos'));
    expect(screen.getByText('Historial de pagos')).toBeTruthy();
    expect(screen.getByText('Ago 2026 — Cuota admón.')).toBeTruthy();
    expect(screen.getByText('Jun 2026 — Cuota admón.')).toBeTruthy();
  });
});
