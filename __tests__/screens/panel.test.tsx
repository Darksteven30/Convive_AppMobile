import { screen } from '@testing-library/react-native';

import { setMockBalance } from '@/services/payments.service';

import { navigate, renderSignedIn } from '../helpers/app';

// Datos simulados: casas 56 ($ 45.678,90), 12 ($ 35.000) y 78 ($ 70.000) con saldo; Administración y
// Portería sin saldo. De las PQRS de ejemplo solo la #0003 está pendiente.
describe('Panel del administrador (indicadores con datos del conjunto)', () => {
  it('muestra la cartera por cobrar, las unidades en mora y las PQRS pendientes reales', async () => {
    await renderSignedIn('admin@convive.com', 'Admin123');

    expect(screen.getByText('$ 150.678,90')).toBeTruthy();
    expect(screen.getByText('3 de 5 unidades en mora')).toBeTruthy();
    expect(screen.getByText('solicitud sin responder')).toBeTruthy();
    // Ya no aparecen los valores fijos de la maqueta.
    expect(screen.queryByText('$ 12.450.000,00')).toBeNull();
    expect(screen.queryByText('8 de 120 unidades en mora')).toBeNull();
  });

  it('se actualiza al volver al Panel cuando cambia la cartera', async () => {
    await renderSignedIn('admin@convive.com', 'Admin123');
    setMockBalance('78', 'administracion', 0);

    await navigate('/finanzas');
    await navigate('/panel');

    expect(screen.getByText('$ 80.678,90')).toBeTruthy();
    expect(screen.getByText('2 de 5 unidades en mora')).toBeTruthy();
  });
});
