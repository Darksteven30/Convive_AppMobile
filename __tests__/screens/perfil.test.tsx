import { fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';

import { press, pressDialogButton, renderSignedIn, signInAs } from '../helpers/app';

const guardar = () => screen.getByRole('button', { name: 'Guardar cambios' });
const [actual, nueva, confirmar] = ['Contraseña actual', 'Nueva contraseña', 'Confirmar nueva contraseña'];

async function openPerfil() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  await press(screen.getByLabelText('Ver perfil'));
  expect(app.getPathname()).toBe('/perfil');
  return app;
}

async function openCambiarContrasena() {
  const app = await openPerfil();
  await press(screen.getByText('Cambiar contraseña'));
  expect(app.getPathname()).toBe('/cambiar-contrasena');
  return app;
}

async function fill(label: string, value: string) {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}

describe('RF16 · Perfil', () => {
  it('muestra nombre, unidad, rol, correo, teléfono y casa del usuario en sesión', async () => {
    await openPerfil();

    expect(screen.getByText('Monica Galvis')).toBeTruthy();
    expect(screen.getByText('Casa # 56 Cali - Valle')).toBeTruthy();
    expect(screen.getByText('Residente')).toBeTruthy();
    expect(screen.getByText('monica@gmail.com')).toBeTruthy();
    expect(screen.getByText('311 123 4567')).toBeTruthy();
    expect(screen.getByText(MSG.RF16.readOnlyData)).toBeTruthy();
  });

  it('solo el teléfono se puede editar (correo y casa son de solo lectura)', async () => {
    await openPerfil();
    expect(screen.getAllByText('Editar')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Editar teléfono' })).toBeTruthy();
  });

  it('MSG-RF16-01: actualiza el teléfono y lo conserva al volver al perfil', async () => {
    await openPerfil();
    await press(screen.getByRole('button', { name: 'Editar teléfono' }));
    expect(screen.getByLabelText('Teléfono').props.value).toBe('3111234567');

    await fill('Teléfono', '300 111 2233');
    await press(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(MSG.RF16.phoneUpdated)).toBeTruthy();
    expect(screen.getByText('300 111 2233')).toBeTruthy();
    expect(screen.queryByLabelText('Teléfono')).toBeNull();

    await press(screen.getByLabelText('Volver'));
    await press(screen.getByLabelText('Ver perfil'));
    expect(screen.getByText('300 111 2233')).toBeTruthy();
  });

  it('MSG-RF16-02: el teléfono debe tener 10 dígitos y empezar por 3', async () => {
    await openPerfil();
    await press(screen.getByRole('button', { name: 'Editar teléfono' }));

    await fill('Teléfono', '2111234567');
    await fireEvent(screen.getByLabelText('Teléfono'), 'blur');
    expect(screen.getByText(MSG.RF16.phoneInvalid)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await fill('Teléfono', '311123');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    // El mensaje desaparece al corregir el dato.
    await fill('Teléfono', '3201234567');
    expect(screen.queryByText(MSG.RF16.phoneInvalid)).toBeNull();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });

  it('solo acepta dígitos y «Guardar» sigue deshabilitado si el teléfono no cambió', async () => {
    await openPerfil();
    await press(screen.getByRole('button', { name: 'Editar teléfono' }));

    await fill('Teléfono', '311-123-4567');
    expect(screen.getByLabelText('Teléfono').props.value).toBe('3111234567');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('«Cancelar» descarta el cambio del teléfono', async () => {
    await openPerfil();
    await press(screen.getByRole('button', { name: 'Editar teléfono' }));
    await fill('Teléfono', '3001112233');
    await press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.getByText('311 123 4567')).toBeTruthy();
  });

  it('MSG-RF16-03: «Cerrar sesión» pide confirmación y «Cancelar» mantiene la sesión', async () => {
    const app = await openPerfil();
    await press(screen.getByText('Cerrar sesión'));

    expect(screen.getByText(MSG.RF16.signOutTitle)).toBeTruthy();
    await pressDialogButton('Cancelar');
    expect(screen.queryByText(MSG.RF16.signOutTitle)).toBeNull();
    expect(app.getPathname()).toBe('/perfil');
  });
});

describe('RF16 · Menú ☰', () => {
  async function openMenu() {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');
    await press(screen.getByLabelText('Abrir menú'));
    return app;
  }

  it('muestra al usuario y las opciones Perfil, Notificaciones, Ayuda y Cerrar sesión', async () => {
    await openMenu();
    expect(screen.getByText('Monica Galvis')).toBeTruthy();
    for (const option of ['Perfil', 'Notificaciones', 'Ayuda', 'Cerrar sesión']) {
      expect(screen.getByRole('button', { name: option })).toBeTruthy();
    }
  });

  it('«Perfil» abre el perfil', async () => {
    const app = await openMenu();
    await press(screen.getByRole('button', { name: 'Perfil' }));
    expect(app.getPathname()).toBe('/perfil');
  });

  it('las opciones que aún no existen avisan que estarán disponibles próximamente', async () => {
    await openMenu();
    await press(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByText(MSG.general.comingSoon)).toBeTruthy();
  });

  it('«Cerrar sesión» pide confirmación y vuelve al inicio de sesión', async () => {
    const app = await openMenu();
    await press(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByText(MSG.RF16.signOutTitle)).toBeTruthy();

    await pressDialogButton('Cerrar sesión');
    expect(app.getPathname()).toBe('/sign-in');
  });
});

describe('RF17 · Cambiar contraseña', () => {
  it('«Guardar cambios» inicia deshabilitado y los campos permiten mostrar la contraseña', async () => {
    await openCambiarContrasena();
    expect(guardar()).toBeDisabled();
    expect(screen.getAllByLabelText('Mostrar contraseña')).toHaveLength(3);
  });

  it('MSG-RF17-05: no permite guardar una contraseña que no cumple las reglas', async () => {
    await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'corta');
    await fireEvent(screen.getByLabelText(nueva), 'blur');
    await fill(confirmar, 'corta');

    expect(screen.getByText(MSG.RF17.weak)).toBeTruthy();
    expect(screen.getByText('○ Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByText('○ Una mayúscula')).toBeTruthy();
    expect(guardar()).toBeDisabled();
  });

  it('MSG-RF17-03: avisa cuando la confirmación no coincide', async () => {
    await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'NuevaClave1');
    await fill(confirmar, 'NuevaClave2');

    expect(screen.getByText(MSG.RF17.mismatch)).toBeTruthy();
    expect(guardar()).toBeDisabled();
  });

  it('MSG-RF17-04: la nueva contraseña debe ser diferente a la actual', async () => {
    await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'Residente123');
    await fill(confirmar, 'Residente123');

    expect(screen.getByText(MSG.RF17.sameAsCurrent)).toBeTruthy();
    expect(guardar()).toBeDisabled();
  });

  it('MSG-RF17-02: el servicio rechaza una contraseña actual incorrecta', async () => {
    const app = await openCambiarContrasena();

    await fill(actual, 'Equivocada1');
    await fill(nueva, 'NuevaClave1');
    await fill(confirmar, 'NuevaClave1');
    await press(guardar());

    expect(screen.getByText(MSG.RF17.wrongCurrent)).toBeTruthy();
    expect(app.getPathname()).toBe('/cambiar-contrasena');

    // El mensaje desaparece al corregir la contraseña actual.
    await fill(actual, 'Residente123');
    expect(screen.queryByText(MSG.RF17.wrongCurrent)).toBeNull();
  });

  it('MSG-RF17-01: guarda, vuelve al perfil y la nueva contraseña es la que sirve para entrar', async () => {
    const app = await openCambiarContrasena();

    await fill(actual, 'Residente123');
    await fill(nueva, 'NuevaClave1');
    await fill(confirmar, 'NuevaClave1');
    expect(screen.getByText('✓ Mínimo 8 caracteres')).toBeTruthy();
    expect(screen.getByText('✓ Una mayúscula')).toBeTruthy();
    expect(screen.getByText('✓ Un número o símbolo')).toBeTruthy();

    await press(guardar());
    expect(screen.getByText(MSG.RF17.updated)).toBeTruthy();
    expect(app.getPathname()).toBe('/perfil');

    await press(screen.getByText('Cerrar sesión'));
    await pressDialogButton('Cerrar sesión');
    await signInAs('monica@gmail.com', 'NuevaClave1');
    expect(app.getPathname()).toBe('/inicio');
  });

  it('MSG-RF17-06: con datos escritos, la flecha ← pide confirmación antes de salir', async () => {
    const app = await openCambiarContrasena();
    await fill(actual, 'Residente123');

    await press(screen.getByLabelText('Volver'));
    expect(screen.getByText(MSG.RF17.leaveTitle)).toBeTruthy();

    await pressDialogButton('Seguir editando');
    expect(app.getPathname()).toBe('/cambiar-contrasena');
    expect(screen.getByLabelText(actual).props.value).toBe('Residente123');

    await press(screen.getByLabelText('Volver'));
    await pressDialogButton('Salir');
    expect(app.getPathname()).toBe('/perfil');
  });

  it('sin datos escritos, la flecha ← vuelve directamente', async () => {
    const app = await openCambiarContrasena();
    await press(screen.getByLabelText('Volver'));
    expect(screen.queryByText(MSG.RF17.leaveTitle)).toBeNull();
    expect(app.getPathname()).toBe('/perfil');
  });
});
