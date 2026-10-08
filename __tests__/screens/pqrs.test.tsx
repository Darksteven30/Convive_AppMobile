import { fireEvent, screen } from '@testing-library/react-native';

import { navigate, press, renderSignedIn } from '../helpers/app';

// Los avisos son toasts (useFeedback): a diferencia de Alert.alert, también se ven en web.
async function openPqrs() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  await press(screen.getByText('Radicar PQRS'));
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
    expect(screen.getByTestId('toast-error')).toHaveTextContent('Completa el tipo y la descripción.');

    await fireEvent.changeText(screen.getByLabelText('Tipo'), 'Ruido');
    await press(screen.getByText('Radicar'));
    expect(screen.getByTestId('toast-error')).toHaveTextContent('Completa el tipo y la descripción.');
    expect(screen.queryByText('#0232 — Ruido')).toBeNull();
  });

  it('radica una PQRS nueva con el siguiente consecutivo y limpia el formulario', async () => {
    await openPqrs();

    await fireEvent.changeText(screen.getByLabelText('Tipo'), 'Parqueadero');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Carro mal parqueado en zona común');
    await press(screen.getByText('Radicar'));

    expect(screen.getByText('#0232 — Parqueadero')).toBeTruthy();
    expect(screen.getByTestId('toast-success')).toHaveTextContent('Tu solicitud #0232 fue registrada.');
    expect(screen.getByLabelText('Tipo').props.value).toBe('');
    expect(screen.getByLabelText('Descripción').props.value).toBe('');
  });

  it('«Adjuntar foto» avisa que estará disponible próximamente', async () => {
    await openPqrs();

    await press(screen.getByLabelText('Adjuntar foto'));
    expect(screen.getByTestId('toast-info')).toHaveTextContent('La carga de fotos estará disponible próximamente.');
  });

  it('"Informar novedad" en Inicio también abre PQRS', async () => {
    // Vigilancia entra a Visitantes; «Informar novedad» está en Inicio.
    const app = await renderSignedIn('vigilancia@convive.com', 'Vigilancia123');
    await navigate('/inicio');

    await press(screen.getByText('Informar novedad'));
    expect(app.getPathname()).toBe('/pqrs');
  });
});
