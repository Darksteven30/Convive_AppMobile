import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { press, renderSignedIn } from '../helpers/app';

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

async function openPqrs() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  await press(screen.getByText('Realizar PQR'));
  expect(app.getPathname()).toBe('/pqrs');
}

describe('PQRS', () => {
  it('lista las PQRS existentes', async () => {
    await openPqrs();

    expect(screen.getByText('#0231 — Daño portón')).toBeTruthy();
    expect(screen.getByText('#0225 — Ruido torre 4')).toBeTruthy();
    expect(screen.getByText('#0198 — Fuga de agua')).toBeTruthy();
  });

  it('no radica si faltan el tipo o la descripción', async () => {
    await openPqrs();

    await press(screen.getByText('Radicar'));
    expect(alertSpy).toHaveBeenCalledWith('Nueva PQRS', 'Completa el tipo y la descripción.');

    await fireEvent.changeText(screen.getByLabelText('Tipo'), 'Ruido');
    await press(screen.getByText('Radicar'));
    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('#0232 — Ruido')).toBeNull();
  });

  it('radica una PQRS nueva con el siguiente consecutivo y limpia el formulario', async () => {
    await openPqrs();

    await fireEvent.changeText(screen.getByLabelText('Tipo'), 'Parqueadero');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Carro mal parqueado en zona común');
    await press(screen.getByText('Radicar'));

    expect(screen.getByText('#0232 — Parqueadero')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('PQRS radicada', 'Tu solicitud #0232 fue registrada.');
    expect(screen.getByLabelText('Tipo').props.value).toBe('');
    expect(screen.getByLabelText('Descripción').props.value).toBe('');
  });

  it('"Informar novedad" en Inicio también abre PQRS', async () => {
    const app = await renderSignedIn('vigilancia@convive.com', 'Vigilancia123');

    await press(screen.getByText('Informar novedad'));
    expect(app.getPathname()).toBe('/pqrs');
  });
});
