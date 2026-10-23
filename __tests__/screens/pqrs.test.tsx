import { fireEvent, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { MSG } from '@/constants/messages';
import { mockAdminNotifications } from '@/services/pqrs.service';

import { navigate, press, pressDialogButton, renderSignedIn } from '../helpers/app';

// La cámara y la galería se simulan: en Jest no hay selector de imágenes.
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const requestCamera = ImagePicker.requestCameraPermissionsAsync as jest.Mock;
const requestLibrary = ImagePicker.requestMediaLibraryPermissionsAsync as jest.Mock;
const launchCamera = ImagePicker.launchCameraAsync as jest.Mock;
const launchLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

const MB = 1024 * 1024;
const DAMAGE_TEXT = 'La baranda de la escalera de la torre 2 está suelta y puede caerse.';

const asset = (name: string, mimeType = 'image/jpeg', fileSize = 2 * MB) => ({
  uri: `file:///fotos/${name}`,
  fileName: name,
  mimeType,
  fileSize,
  width: 4000,
  height: 3000,
});
const picked = (...assets: ReturnType<typeof asset>[]) => ({ canceled: false, assets });

const radicar = () => screen.getByRole('button', { name: 'Radicar' });

beforeEach(() => {
  requestCamera.mockResolvedValue({ granted: true });
  requestLibrary.mockResolvedValue({ granted: true });
});
afterEach(() => jest.clearAllMocks());

async function openPqrs(email = 'monica@gmail.com', password = 'Residente123') {
  const app = await renderSignedIn(email, password);
  await navigate('/pqrs');
  expect(app.getPathname()).toBe('/pqrs');
  return app;
}

async function chooseType(label: string) {
  await press(screen.getByRole('button', { name: 'Tipo' }));
  await press(screen.getByText(label));
}

async function addFromGallery(...assets: ReturnType<typeof asset>[]) {
  launchLibrary.mockResolvedValueOnce(picked(...assets));
  await press(screen.getByRole('button', { name: 'Adjuntar foto' }));
  await pressDialogButton('Elegir de la galería');
}

describe('RF07 · lista de PQRS', () => {
  it('«Radicar PQRS» en Inicio abre PQRS con la pestaña resaltada', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByText('Radicar PQRS'));

    expect(app.getPathname()).toBe('/pqrs');
    expect(screen.getByRole('button', { name: 'PQRS' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Reservas' })).not.toBeSelected();
  });

  it('muestra las PQRS del usuario de la más reciente a la más antigua, con su estado', async () => {
    await openPqrs();

    const titles = screen.getAllByText(/^#\d{4} — /).map((node) => node.props.children.join(''));
    expect(titles).toEqual(['#0003 — Reporte de daño', '#0002 — Queja', '#0001 — Reclamo']);
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText('En proceso')).toBeTruthy();
    expect(screen.getByText('Resuelto')).toBeTruthy();
    // Ya no se usa la estrella de la maqueta.
    expect(screen.queryByTestId('icon-star-outline')).toBeNull();
  });

  it('sin PQRS radicadas muestra el estado vacío (MSG-RF07-09)', async () => {
    await openPqrs('junta@convive.com', 'Junta123');

    expect(screen.getByText(MSG.RF07.empty)).toBeTruthy();
  });

  it('«›» abre el detalle con el historial de respuestas', async () => {
    const app = await openPqrs();

    await press(screen.getByRole('button', { name: 'Ver #0001' }));

    expect(app.getPathname()).toBe('/pqrs/pq-1');
    expect(screen.getByText('PQRS #0001')).toBeTruthy();
    expect(screen.getByText('Fuga de agua en el techo del parqueadero, frente a la casa 56.')).toBeTruthy();
    expect(screen.getByText('Radicada')).toBeTruthy();
    expect(screen.getByText('Recibimos tu reclamo. El plomero revisa la fuga el viernes.')).toBeTruthy();
    expect(screen.getByText('Se cambió el tubo dañado y se selló el techo. Gracias por avisar.')).toBeTruthy();
    expect(screen.getAllByText('David Muñoz')).toHaveLength(2);
  });

  it('el detalle sin respuestas lo indica', async () => {
    await openPqrs();

    await press(screen.getByRole('button', { name: 'Ver #0003' }));

    expect(screen.getByText('PQRS #0003')).toBeTruthy();
    expect(screen.getByText(MSG.RF07.noResponses)).toBeTruthy();
  });

  it('no muestra el detalle de una PQRS de otra persona', async () => {
    await openPqrs('junta@convive.com', 'Junta123');

    await navigate({ pathname: '/pqrs/[id]', params: { id: 'pq-1' } });

    expect(screen.getByText(MSG.RF07.notFound)).toBeTruthy();
  });
});

describe('RF07 · formulario', () => {
  it('«Tipo» es una lista con el catálogo y avisa si se cierra sin elegir (MSG-RF07-02)', async () => {
    await openPqrs();

    await press(screen.getByRole('button', { name: 'Tipo' }));
    for (const label of ['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Reporte de daño']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    const closeButtons = screen.getAllByLabelText('Cerrar');
    await press(closeButtons[closeButtons.length - 1]);

    expect(screen.getByText(MSG.RF07.typeRequired)).toBeTruthy();
  });

  it('«Radicar» se habilita con tipo y descripción; la descripción necesita 20 caracteres (MSG-RF07-03)', async () => {
    await openPqrs();
    expect(radicar()).toBeDisabled();

    await chooseType('Petición');
    expect(radicar()).toBeDisabled();

    const field = screen.getByLabelText('Descripción');
    await fireEvent.changeText(field, 'Muy corta');
    expect(screen.getByText('9/1000')).toBeTruthy();
    await fireEvent(field, 'blur');
    expect(screen.getByText(MSG.RF07.descriptionShort)).toBeTruthy();

    // Habilitado, pero no radica con la descripción corta.
    expect(radicar()).toBeEnabled();
    await press(radicar());
    expect(screen.queryByText(/Tu solicitud fue radicada/)).toBeNull();
    expect(field.props.maxLength).toBe(1000);
  });

  it('el reporte de daño exige al menos una foto (MSG-RF07-07)', async () => {
    await openPqrs();

    await chooseType('Reporte de daño');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), DAMAGE_TEXT);

    expect(screen.getByText(MSG.RF07.photoRequired)).toBeTruthy();
    expect(radicar()).toBeDisabled();

    await addFromGallery(asset('baranda.jpg'));

    expect(screen.queryByText(MSG.RF07.photoRequired)).toBeNull();
    expect(screen.getByLabelText('Foto 1')).toBeTruthy();
    expect(radicar()).toBeEnabled();
  });
});

describe('RF07 · fotos', () => {
  it('rechaza formatos distintos de JPG o PNG (MSG-RF07-04) y fotos de más de 5 MB (MSG-RF07-05)', async () => {
    await openPqrs();

    await addFromGallery(asset('animacion.gif', 'image/gif'));
    expect(screen.getByText(MSG.RF07.invalidFormat)).toBeTruthy();
    expect(screen.queryByLabelText('Foto 1')).toBeNull();

    await addFromGallery(asset('enorme.png', 'image/png', 6 * MB));
    expect(screen.getByText(MSG.RF07.tooLarge)).toBeTruthy();

    // Una foto válida quita el mensaje.
    await addFromGallery(asset('ok.png', 'image/png', 5 * MB));
    expect(screen.queryByText(MSG.RF07.tooLarge)).toBeNull();
    expect(screen.getByLabelText('Foto 1')).toBeTruthy();
  });

  it('permite máximo 3 fotos (MSG-RF07-06) y cada miniatura tiene una «x» para quitarla', async () => {
    await openPqrs();

    await addFromGallery(asset('1.jpg'), asset('2.jpg'), asset('3.jpg'), asset('4.jpg'));
    expect(screen.getByTestId('toast-info')).toHaveTextContent(MSG.RF07.tooManyPhotos);
    expect(screen.getByText('Fotos (opcional) (3/3)')).toBeTruthy();
    expect(screen.queryByLabelText('Foto 4')).toBeNull();
    // La galería solo deja elegir las que faltan.
    expect(launchLibrary).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 3 }));

    await press(screen.getByRole('button', { name: 'Adjuntar foto' }));
    expect(screen.getByTestId('toast-info')).toHaveTextContent(MSG.RF07.tooManyPhotos);

    await press(screen.getByRole('button', { name: 'Quitar foto 2' }));
    expect(screen.getByText('Fotos (opcional) (2/3)')).toBeTruthy();
    expect(screen.queryByLabelText('Foto 3')).toBeNull();
  });

  it('toma una foto con la cámara', async () => {
    await openPqrs();
    launchCamera.mockResolvedValueOnce(picked(asset('camara.jpg')));

    await press(screen.getByRole('button', { name: 'Adjuntar foto' }));
    await pressDialogButton('Tomar foto');

    expect(requestCamera).toHaveBeenCalled();
    expect(screen.getByLabelText('Foto 1')).toBeTruthy();
  });

  it.each([
    ['Tomar foto', requestCamera],
    ['Elegir de la galería', requestLibrary],
  ])('si se niega el permiso para «%s», ofrece ir a ajustes (MSG-RF07-08)', async (option, request) => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    request.mockResolvedValueOnce({ granted: false });
    await openPqrs();

    await press(screen.getByRole('button', { name: 'Adjuntar foto' }));
    await pressDialogButton(option);

    expect(screen.getByText(MSG.RF07.permissionDenied)).toBeTruthy();
    expect(launchCamera).not.toHaveBeenCalled();
    expect(launchLibrary).not.toHaveBeenCalled();
    await pressDialogButton('Ir a ajustes');
    expect(openSettings).toHaveBeenCalled();
  });
});

describe('RF07 · radicar', () => {
  it('radica con el siguiente consecutivo, queda «Pendiente», avisa a la administración y limpia el formulario (MSG-RF07-01)', async () => {
    await openPqrs();

    await chooseType('Reporte de daño');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), DAMAGE_TEXT);
    await addFromGallery(asset('baranda.jpg'), asset('detalle.png', 'image/png'));
    await press(radicar());

    expect(screen.getByText(MSG.RF07.filed('#0004'))).toBeTruthy();
    await pressDialogButton('Aceptar');

    const titles = screen.getAllByText(/^#\d{4} — /).map((node) => node.props.children.join(''));
    expect(titles[0]).toBe('#0004 — Reporte de daño');
    expect(screen.getAllByText('Pendiente')).toHaveLength(2);

    expect(mockAdminNotifications()).toEqual([
      expect.objectContaining({ recipientId: 'u2', title: 'Nueva PQRS', message: 'Monica Galvis radicó la solicitud #0004.' }),
    ]);

    expect(screen.getByLabelText('Descripción').props.value).toBe('');
    expect(screen.queryByLabelText('Foto 1')).toBeNull();
    expect(radicar()).toBeDisabled();
  });

  it('la PQRS radicada muestra sus fotos en el detalle', async () => {
    await openPqrs();
    await chooseType('Sugerencia');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Instalar más bancas en el parque infantil.');
    await addFromGallery(asset('parque.jpg'));
    await press(radicar());
    await pressDialogButton('Aceptar');

    await press(screen.getByRole('button', { name: 'Ver #0004' }));

    expect(screen.getByText('Sugerencia')).toBeTruthy();
    expect(screen.getByLabelText('Foto 1')).toBeTruthy();
    expect(screen.getByText(MSG.RF07.noResponses)).toBeTruthy();
  });

  it('en el detalle, tocar una foto la amplía y se puede pasar a la siguiente', async () => {
    await openPqrs();
    await chooseType('Reporte de daño');
    await fireEvent.changeText(screen.getByLabelText('Descripción'), DAMAGE_TEXT);
    await addFromGallery(asset('baranda.jpg'), asset('detalle.png', 'image/png'));
    await press(radicar());
    await pressDialogButton('Aceptar');
    await press(screen.getByRole('button', { name: 'Ver #0004' }));

    await press(screen.getByRole('button', { name: 'Ampliar foto 2' }));
    expect(screen.getByText('Foto 2 de 2')).toBeTruthy();
    expect(screen.getByLabelText('Foto 2 ampliada').props.source).toEqual({ uri: 'file:///fotos/detalle.png' });
    expect(screen.getByRole('button', { name: 'Foto siguiente' })).toBeDisabled();

    await press(screen.getByRole('button', { name: 'Foto anterior' }));
    expect(screen.getByText('Foto 1 de 2')).toBeTruthy();
    expect(screen.getByLabelText('Foto 1 ampliada').props.source).toEqual({ uri: 'file:///fotos/baranda.jpg' });

    await press(screen.getByRole('button', { name: 'Cerrar foto' }));
    expect(screen.queryByText('Foto 1 de 2')).toBeNull();
  });

  it('«Informar novedad» en Inicio también abre PQRS', async () => {
    // Vigilancia entra a Visitantes; «Informar novedad» está en Inicio.
    const app = await renderSignedIn('vigilancia@convive.com', 'Vigilancia123');
    await navigate('/inicio');

    await press(screen.getByText('Informar novedad'));
    expect(app.getPathname()).toBe('/pqrs');
  });
});
