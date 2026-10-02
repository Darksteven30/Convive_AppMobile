import { act, fireEvent, screen } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { MSG } from '@/constants/messages';
import { TOAST_DURATION_MS } from '@/context/FeedbackContext';

import { navigate, press, renderSignedIn } from '../helpers/app';

// Los selectores nativos se simulan: en Jest no hay cámara, galería ni sistema de archivos.
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;
const launchCameraAsync = ImagePicker.launchCameraAsync as jest.Mock;
const requestCameraPermissionsAsync = ImagePicker.requestCameraPermissionsAsync as jest.Mock;

const guardar = () => screen.getByRole('button', { name: 'Guardar' });

async function openForm() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  await press(screen.getByText('Registrar movimiento'));
  expect(app.getPathname()).toBe('/finanzas/nuevo');
  return app;
}

async function chooseCategory(name: string) {
  await press(screen.getByRole('button', { name: 'Categoría' }));
  await press(screen.getByText(name));
}

async function fillValidForm() {
  await press(screen.getByRole('radio', { name: 'Egreso' }));
  await chooseCategory('Aseo');
  await fireEvent.changeText(screen.getByLabelText('Monto'), '350000');
  await fireEvent.changeText(screen.getByLabelText('Concepto / descripción'), 'Compra de insumos de aseo');
}

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('RF03 · acceso', () => {
  it('el Panel del administrador lleva a Finanzas y a Nuevo movimiento', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');

    await press(screen.getByText('Ver movimientos'));
    expect(app.getPathname()).toBe('/finanzas');
    expect(screen.getByText('Recaudo cuotas de administración septiembre')).toBeTruthy();

    await press(screen.getByText('Nuevo movimiento'));
    expect(app.getPathname()).toBe('/finanzas/nuevo');
  });

  it.each([
    ['junta directiva', 'junta@convive.com', 'Junta123'],
    ['propietario', 'monica@gmail.com', 'Residente123'],
    ['vigilancia', 'vigilancia@convive.com', 'Vigilancia123'],
  ])('%s no puede abrir Finanzas ni Nuevo movimiento por ruta directa', async (_role, email, password) => {
    const app = await renderSignedIn(email, password);

    await navigate('/finanzas');
    expect(app.getPathname()).not.toBe('/finanzas');

    await navigate('/finanzas/nuevo');
    expect(app.getPathname()).not.toBe('/finanzas/nuevo');
  });
});

describe('RF03 · formulario', () => {
  it('«Guardar» está deshabilitado hasta completar los campos obligatorios', async () => {
    await openForm();
    expect(guardar()).toBeDisabled();

    await fillValidForm();
    expect(guardar()).toBeEnabled();
  });

  it('la fecha es hoy por defecto', async () => {
    await openForm();
    const today = new Date();
    const expected = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('al cambiar el tipo se recargan las categorías y se borra la elegida', async () => {
    await openForm();

    await press(screen.getByRole('button', { name: 'Categoría' }));
    expect(screen.getByText('Cuotas de administración')).toBeTruthy();
    expect(screen.queryByText('Nómina')).toBeNull();
    await press(screen.getByText('Cuotas de administración'));

    await press(screen.getByRole('radio', { name: 'Egreso' }));
    expect(screen.getByText('Selecciona una categoría')).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Categoría' }));
    expect(screen.getByText('Nómina')).toBeTruthy();
    expect(screen.queryByText('Cuotas de administración')).toBeNull();
    // Las categorías inactivas no aparecen.
    expect(screen.queryByText('Eventos')).toBeNull();
  });

  it('MSG-RF03-03: cerrar la lista sin elegir muestra «Selecciona una categoría.»', async () => {
    await openForm();
    await press(screen.getByRole('button', { name: 'Categoría' }));
    await press(screen.getAllByLabelText('Cerrar')[0]);

    expect(screen.getByText(MSG.RF03.categoryRequired)).toBeTruthy();
  });

  it('el monto se formatea mientras se escribe', async () => {
    await openForm();
    await fireEvent.changeText(screen.getByLabelText('Monto'), '1250000');
    expect(screen.getByLabelText('Monto').props.value).toBe('$ 1.250.000');
  });

  it('MSG-RF03-02: un monto en 0 muestra el error al salir del campo', async () => {
    await openForm();
    await fireEvent.changeText(screen.getByLabelText('Monto'), '0');
    await fireEvent(screen.getByLabelText('Monto'), 'blur');

    expect(screen.getByText(MSG.RF03.amountInvalid)).toBeTruthy();
  });

  it('MSG-RF03-05: la descripción corta muestra el error y hay contador de caracteres', async () => {
    await openForm();
    await fireEvent.changeText(screen.getByLabelText('Concepto / descripción'), 'Aseo');
    expect(screen.getByText('4/250')).toBeTruthy();

    await fireEvent(screen.getByLabelText('Concepto / descripción'), 'blur');
    expect(screen.getByText(MSG.RF03.descriptionShort)).toBeTruthy();
  });

  it('MSG-RF03-04: el calendario no permite elegir fechas futuras', async () => {
    await openForm();
    await press(screen.getByRole('button', { name: 'Fecha' }));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const label = `${tomorrow.getDate()} de ${months[tomorrow.getMonth()]} de ${tomorrow.getFullYear()}`;
    if (tomorrow.getMonth() !== new Date().getMonth()) {
      await press(screen.getByLabelText('Mes siguiente'));
    }
    expect(screen.getByLabelText(label)).toBeDisabled();
  });
});

describe('RF03 · guardar', () => {
  it('MSG-RF03-01: guarda, avisa con un Toast y el movimiento aparece en la lista', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');
    await press(screen.getByText('Ver movimientos'));
    await press(screen.getByText('Nuevo movimiento'));

    await fillValidForm();
    await press(guardar());

    expect(screen.getByText(MSG.RF03.saved)).toBeTruthy();
    expect(app.getPathname()).toBe('/finanzas');
    expect(screen.getByText('Compra de insumos de aseo')).toBeTruthy();
    expect(screen.getByText('−$ 350.000,00')).toBeTruthy();

    await act(() => jest.advanceTimersByTimeAsync(TOAST_DURATION_MS));
    expect(screen.queryByText(MSG.RF03.saved)).toBeNull();
  });
});

describe('RF03 · cancelar', () => {
  it('sin datos, «Cancelar» vuelve directamente', async () => {
    const app = await openForm();
    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/panel');
  });

  it('MSG-RF03-06: con datos pide confirmación antes de descartar', async () => {
    const app = await openForm();
    await fireEvent.changeText(screen.getByLabelText('Monto'), '1000');

    await press(screen.getByLabelText('Cancelar'));
    expect(screen.getByText(MSG.RF03.discardTitle)).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(app.getPathname()).toBe('/finanzas/nuevo');
    expect(screen.getByLabelText('Monto').props.value).toBe('$ 1.000');

    await press(screen.getByLabelText('Cancelar'));
    await press(screen.getByRole('button', { name: 'Descartar' }));
    expect(app.getPathname()).toBe('/panel');
  });
});

describe('RF03 · soporte', () => {
  it('adjunta un PDF desde los archivos y permite quitarlo', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://factura.pdf', name: 'factura.pdf', mimeType: 'application/pdf', size: 200 * 1024 }],
    });
    await openForm();

    await press(screen.getByText('Adjuntar soporte'));
    await press(screen.getByRole('button', { name: 'Seleccionar archivo' }));

    expect(getDocumentAsync).toHaveBeenCalledWith({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });
    expect(screen.getByText('factura.pdf')).toBeTruthy();
    expect(screen.getByText('200 KB')).toBeTruthy();

    await press(screen.getByLabelText('Quitar soporte'));
    expect(screen.queryByText('factura.pdf')).toBeNull();
  });

  it('MSG-RF03-08: rechaza archivos de más de 5 MB', async () => {
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://grande.pdf', name: 'grande.pdf', mimeType: 'application/pdf', size: 6 * 1024 * 1024 }],
    });
    await openForm();

    await press(screen.getByText('Adjuntar soporte'));
    await press(screen.getByRole('button', { name: 'Seleccionar archivo' }));

    expect(screen.getByText(MSG.RF03.invalidFile)).toBeTruthy();
    expect(screen.queryByText('grande.pdf')).toBeNull();
  });

  it('toma una foto con la cámara cuando hay permiso', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file://foto.jpg', fileName: 'foto.jpg', mimeType: 'image/jpeg', fileSize: 1024 * 1024 }],
    });
    await openForm();

    await press(screen.getByText('Adjuntar soporte'));
    await press(screen.getByRole('button', { name: 'Tomar foto' }));

    expect(screen.getByText('foto.jpg')).toBeTruthy();
    expect(screen.getByText('1,0 MB')).toBeTruthy();
  });

  it('sin permiso de cámara ofrece ir a ajustes', async () => {
    requestCameraPermissionsAsync.mockResolvedValue({ granted: false });
    await openForm();

    await press(screen.getByText('Adjuntar soporte'));
    await press(screen.getByRole('button', { name: 'Tomar foto' }));

    expect(launchCameraAsync).not.toHaveBeenCalled();
    expect(screen.getByText(MSG.RF03.mediaPermissionDenied)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ir a ajustes' })).toBeTruthy();
  });

  it('si el usuario cancela el selector no pasa nada', async () => {
    getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
    await openForm();

    await press(screen.getByText('Adjuntar soporte'));
    await press(screen.getByRole('button', { name: 'Seleccionar archivo' }));

    expect(screen.getByText('Adjuntar soporte')).toBeTruthy();
    expect(screen.queryByText(MSG.RF03.invalidFile)).toBeNull();
  });
});
