import { screen } from '@testing-library/react-native';

import { navigate, press, renderSignedIn } from '../helpers/app';

type RoleCase = {
  role: string;
  email: string;
  password: string;
  label: string;
  canPay: boolean;
  canSeeGeneral: boolean;
  canSeePanel: boolean;
  canSeeVisitors: boolean;
};

// Matriz de acceso del RF01.
const roles: RoleCase[] = [
  { role: 'administrador', email: 'admin@convive.com', password: 'Admin123', label: 'Administrador', canPay: true, canSeeGeneral: true, canSeePanel: true, canSeeVisitors: false },
  { role: 'junta directiva', email: 'junta@convive.com', password: 'Junta123', label: 'Junta directiva', canPay: true, canSeeGeneral: true, canSeePanel: false, canSeeVisitors: false },
  { role: 'residente', email: 'monica@gmail.com', password: 'Residente123', label: 'Residente', canPay: true, canSeeGeneral: true, canSeePanel: false, canSeeVisitors: false },
  { role: 'vigilancia', email: 'vigilancia@convive.com', password: 'Vigilancia123', label: 'Vigilancia', canPay: false, canSeeGeneral: false, canSeePanel: false, canSeeVisitors: true },
];

const can = (allowed: boolean, yes: string, no: string) => (allowed ? yes : no);

describe.each(roles)('RF01 · rol $role', (testCase) => {
  const { email, password, label, canPay, canSeeGeneral, canSeePanel, canSeeVisitors } = testCase;

  it(`${can(canPay, 've la pestaña Pagos y', 'no ve la pestaña Pagos ni')} el estado de cuenta en Inicio`, async () => {
    await renderSignedIn(email, password);
    await navigate('/inicio');

    expect(screen.queryByText('Pagos') !== null).toBe(canPay);
    expect(screen.queryByText('Estado de la cuenta') !== null).toBe(canPay);
  });

  it('solo ve las pestañas que le corresponden', async () => {
    await renderSignedIn(email, password);

    expect(screen.queryByText('General') !== null).toBe(canSeeGeneral);
    expect(screen.queryByText('Panel') !== null).toBe(canSeePanel);
    expect(screen.queryByText('Visitantes') !== null).toBe(canSeeVisitors);
  });

  it(`${can(canPay, 'puede', 'no puede')} abrir Pagos y el flujo de pago por ruta directa`, async () => {
    const app = await renderSignedIn(email, password);

    await navigate('/pagos');
    expect(app.getPathname() === '/pagos').toBe(canPay);

    await navigate('/pago/seleccion');
    expect(app.getPathname() === '/pago/seleccion').toBe(canPay);
  });

  it(`${can(canSeeGeneral, 'puede', 'no puede')} abrir General por ruta directa`, async () => {
    const app = await renderSignedIn(email, password);
    await navigate('/inicio');

    await navigate('/general');
    expect(app.getPathname() === '/general').toBe(canSeeGeneral);
    expect(screen.queryByText('Resumen financiero') !== null).toBe(canSeeGeneral);
  });

  it(`${can(canSeePanel, 'puede', 'no puede')} abrir el Panel y ${can(canSeeVisitors, 'puede', 'no puede')} abrir Visitantes`, async () => {
    const app = await renderSignedIn(email, password);
    await navigate('/inicio');

    await navigate('/panel');
    expect(app.getPathname() === '/panel').toBe(canSeePanel);

    await navigate('/visitantes');
    expect(app.getPathname() === '/visitantes').toBe(canSeeVisitors);
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
