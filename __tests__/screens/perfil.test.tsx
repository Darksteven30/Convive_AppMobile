import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { press, renderSignedIn } from '../helpers/app';

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

const guardar = () => screen.getByRole('button', { name: 'Guardar cambios' });
const [actual, nueva, confirmar] = ['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva contraseña'];

async function openCambiarContrasena() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  await press(screen.getByLabelText('Ver perfil'));
  await press(screen.getByText('Cambiar contraseña'));
  expect(app.getPathname()).toBe('/cambiar-contrasena');
  return app;
}

async function fill(label: string, value: string) {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}

describe('Perfil', () => {
  it('muestra los datos personales del usuario en sesión', async () => {
    await renderSignedIn('monica@gmail.com', 'Residente123');
    await press(screen.getByLabelText('Ver perfil'));

    expect(screen.getByText('Monica Galvis')).toBeTruthy();
    expect(screen.getByText('Casa # 56 Cali - Valle')).toBeTruthy();
    expect(screen.getByText('311 123 4567')).toBeTruthy();
  });
});

describe('Cambiar contraseña', () => {
  it('"Guardar cambios" inicia deshabilitado', async () => {
    await openCambiarContrasena();
    expect(guardar()).toBeDisabled();
  });

  it('no permite guardar una contraseña que no cumple las reglas', async () => {
    await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'corta');
    await fill(confirmar, 'corta');

    expect(guardar()).toBeDisabled();
    expect(screen.getByText('○ Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByText('○ Una mayúscula')).toBeTruthy();
  });

  it('avisa cuando la confirmación no coincide', async () => {
    await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'NuevaClave1');
    await fill(confirmar, 'NuevaClave2');

    expect(screen.getByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(guardar()).toBeDisabled();
  });

  it('marca las reglas cumplidas y guarda con datos válidos', async () => {
    const app = await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'NuevaClave1');
    await fill(confirmar, 'NuevaClave1');

    expect(screen.getByText('✓ Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByText('✓ Una mayúscula')).toBeTruthy();
    expect(screen.getByText('✓ Un número o símbolo')).toBeTruthy();
    expect(guardar()).toBeEnabled();

    await press(guardar());
    expect(alertSpy).toHaveBeenCalledWith('Contraseña actualizada', 'Tu contraseña se cambió correctamente.');
    expect(app.getPathname()).toBe('/perfil');
  });
});
