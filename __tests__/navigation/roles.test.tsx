import { act, screen } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';

import { press, renderSignedIn } from '../helpers/app';

type RoleCase = {
  role: string;
  email: string;
  password: string;
  label: string;
  canPay: boolean;
  canSeeGeneral: boolean;
};

// Matriz de acceso del RF01.
const roles: RoleCase[] = [
  { role: 'administrador', email: 'admin@convive.com', password: 'Admin123', label: 'Administrador', canPay: true, canSeeGeneral: true },
  { role: 'junta directiva', email: 'junta@convive.com', password: 'Junta123', label: 'Junta directiva', canPay: true, canSeeGeneral: true },
  { role: 'residente', email: 'monica@gmail.com', password: 'Residente123', label: 'Residente', canPay: true, canSeeGeneral: false },
  { role: 'vigilancia', email: 'vigilancia@convive.com', password: 'Vigilancia123', label: 'Vigilancia', canPay: false, canSeeGeneral: false },
];

async function navigate(href: Href) {
  await act(() => router.navigate(href));
}

describe.each(roles)('RF01 · rol $role', ({ email, password, label, canPay, canSeeGeneral }) => {
  it(`${canPay ? 've la pestaña Pagos y' : 'no ve la pestaña Pagos ni'} el estado de cuenta en Inicio`, async () => {
    await renderSignedIn(email, password);

    expect(screen.queryByText('Pagos') !== null).toBe(canPay);
    expect(screen.queryByText('Estado de la cuenta') !== null).toBe(canPay);
  });

  it(`${canSeeGeneral ? 've' : 'no ve'} la pestaña General`, async () => {
    await renderSignedIn(email, password);

    expect(screen.queryByText('General') !== null).toBe(canSeeGeneral);
  });

  it(`${canPay ? 'puede' : 'no puede'} abrir Pagos y el flujo de pago por ruta directa`, async () => {
    const app = await renderSignedIn(email, password);

    await navigate('/pagos');
    expect(app.getPathname() === '/pagos').toBe(canPay);

    await navigate('/pago/seleccion');
    expect(app.getPathname() === '/pago/seleccion').toBe(canPay);
  });

  it(`${canSeeGeneral ? 'puede' : 'no puede'} abrir General por ruta directa`, async () => {
    const app = await renderSignedIn(email, password);

    await navigate('/general');
    expect(app.getPathname() === '/general').toBe(canSeeGeneral);
    expect(screen.queryByText('Resumen financiero') !== null).toBe(canSeeGeneral);
  });

  it('accede a Reservas, PQRS y Perfil', async () => {
    const app = await renderSignedIn(email, password);

    await navigate('/reservas');
    expect(app.getPathname()).toBe('/reservas');

    await navigate('/pqrs');
    expect(app.getPathname()).toBe('/pqrs');

    await press(screen.getByLabelText('Ver perfil'));
    expect(app.getPathname()).toBe('/perfil');
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(email)).toBeTruthy();
  });
});
