import { act, fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { registerExit } from '@/services/visitors.service';
import { formatTime } from '@/utils/date';

import { press, pressDialogButton, renderSignedIn } from '../helpers/app';

// Visitas de ejemplo (servicio simulado): Ana María Restrepo (CC 1012345678) ya salió de la casa 56
// y Carlos Mejía (CC 79876543) sigue dentro en la casa 12 con el carro ABC123.
// «Ahora» fijo: viernes 30 de octubre de 2026, 09:05 a. m.
const NOW = new Date(2026, 9, 30, 9, 5);
const CARLOS_ENTRY = formatTime(new Date('2026-10-29T13:20:00.000Z'));

const guard: User = {
  id: 'u4',
  name: 'Jorge Pérez',
  initials: 'JP',
  email: 'vigilancia@convive.com',
  phone: '',
  house: 'Portería',
  address: '',
  complex: '',
  role: 'vigilancia',
};

const registrar = () => screen.getByRole('button', { name: 'Registrar entrada' });
const nameField = () => screen.getByLabelText('Nombre completo');
const documentField = () => screen.getByLabelText('Número de documento');
const plateField = () => screen.getByLabelText('Placa del vehículo (opcional)');

async function openVisitantes() {
  const app = await renderSignedIn('vigilancia@convive.com', 'Vigilancia123');
  jest.setSystemTime(NOW);
  expect(app.getPathname()).toBe('/visitantes');
  return app;
}

async function chooseDocumentType(label: string) {
  await press(screen.getByRole('button', { name: 'Tipo de documento' }));
  await press(screen.getByRole('button', { name: label }));
}

async function chooseUnit(label: string) {
  await press(screen.getByRole('button', { name: 'Unidad que autoriza' }));
  await press(screen.getByRole('button', { name: label }));
}

async function typeDocument(value: string) {
  await fireEvent.changeText(documentField(), value);
  await fireEvent(documentField(), 'blur');
  await act(() => jest.advanceTimersByTimeAsync(50));
}

async function fillValidEntry() {
  await fireEvent.changeText(nameField(), 'Luisa Fernanda Ríos');
  await typeDocument('1144556677');
  await chooseUnit('56');
}

describe('RF10 · pantalla', () => {
  it('vigilancia ve el formulario, los visitantes dentro y los esperados hoy', async () => {
    await openVisitantes();

    expect(screen.getByText('Registrar ingreso')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tipo de documento' })).toHaveAccessibilityValue({ text: 'CC' });
    expect(screen.getByRole('button', { name: 'Unidad que autoriza' })).toHaveAccessibilityValue({ text: 'Selecciona la unidad' });
    expect(screen.getByText('Visitantes dentro')).toBeTruthy();
    expect(screen.getByText('Carlos Mejía')).toBeTruthy();
    expect(screen.getByText(`Unidad 12 · Entró ${CARLOS_ENTRY} · ABC123`)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar salida de Carlos Mejía' })).toBeTruthy();
    // Ana María ya salió: no está en la lista.
    expect(screen.queryByText('Ana María Restrepo')).toBeNull();
    expect(screen.getByText('Visitantes esperados hoy')).toBeTruthy();
  });

  it('el tipo de documento ofrece CC, CE, TI y Pasaporte', async () => {
    await openVisitantes();

    await press(screen.getByRole('button', { name: 'Tipo de documento' }));
    for (const label of ['CC', 'CE', 'TI', 'Pasaporte']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    await press(screen.getByRole('button', { name: 'Pasaporte' }));
    expect(screen.getByRole('button', { name: 'Tipo de documento' })).toHaveAccessibilityValue({ text: 'Pasaporte' });
  });
});

describe('RF10 · validaciones', () => {
  it('nombre, documento y unidad son obligatorios (MSG-RF10-04 y MSG-RF10-05)', async () => {
    await openVisitantes();

    await press(registrar());

    expect(screen.getByText(MSG.RF10.nameInvalid)).toBeTruthy();
    expect(screen.getByText(MSG.RF10.documentInvalid)).toBeTruthy();
    expect(screen.getByText(MSG.RF10.unitRequired)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
  });

  it('el nombre debe tener de 3 a 80 caracteres, solo letras y espacios', async () => {
    await openVisitantes();

    await fireEvent.changeText(nameField(), 'Ana 2');
    await fireEvent(nameField(), 'blur');
    expect(screen.getByText(MSG.RF10.nameInvalid)).toBeTruthy();
    expect(nameField().props.maxLength).toBe(80);

    await fireEvent.changeText(nameField(), 'Ana Pérez');
    await fireEvent(nameField(), 'blur');
    expect(screen.queryByText(MSG.RF10.nameInvalid)).toBeNull();
  });

  it('CC: solo números, de 5 a 12 dígitos (MSG-RF10-04)', async () => {
    await openVisitantes();

    expect(documentField().props.keyboardType).toBe('number-pad');
    expect(documentField().props.maxLength).toBe(12);
    await fireEvent.changeText(documentField(), '12a3');
    expect(documentField().props.value).toBe('123');
    await fireEvent(documentField(), 'blur');
    expect(screen.getByText(MSG.RF10.documentInvalid)).toBeTruthy();

    await typeDocument('12345');
    expect(screen.queryByText(MSG.RF10.documentInvalid)).toBeNull();
  });

  it('pasaporte: de 5 a 15 letras o números, en mayúsculas', async () => {
    await openVisitantes();

    await chooseDocumentType('Pasaporte');
    expect(documentField().props.keyboardType).toBe('default');
    expect(documentField().props.maxLength).toBe(15);
    await typeDocument('ab-12');
    expect(documentField().props.value).toBe('AB12');
    expect(screen.getByText(MSG.RF10.documentInvalid)).toBeTruthy();

    await typeDocument('ab123456');
    expect(documentField().props.value).toBe('AB123456');
    expect(screen.queryByText(MSG.RF10.documentInvalid)).toBeNull();
  });

  it('la placa es opcional, se escribe en mayúsculas y debe ser AAA123 o AAA12A (MSG-RF10-06)', async () => {
    await openVisitantes();

    await fireEvent.changeText(plateField(), 'ab123');
    expect(plateField().props.value).toBe('AB123');
    await fireEvent(plateField(), 'blur');
    expect(screen.getByText(MSG.RF10.plateInvalid)).toBeTruthy();

    await fireEvent.changeText(plateField(), 'xyz12a');
    await fireEvent(plateField(), 'blur');
    expect(plateField().props.value).toBe('XYZ12A');
    expect(screen.queryByText(MSG.RF10.plateInvalid)).toBeNull();
  });
});

describe('RF10 · formulario', () => {
  it('si el documento ya tiene registros, autocompleta el nombre', async () => {
    await openVisitantes();

    await typeDocument('1012345678');

    expect(nameField().props.value).toBe('Ana María Restrepo');
  });

  it('no reemplaza un nombre ya escrito ni autocompleta con otro tipo de documento', async () => {
    await openVisitantes();

    await fireEvent.changeText(nameField(), 'Ana Restrepo');
    await typeDocument('1012345678');
    expect(nameField().props.value).toBe('Ana Restrepo');

    await fireEvent.changeText(nameField(), '');
    await chooseDocumentType('CE');
    await typeDocument('1012345678');
    expect(nameField().props.value).toBe('');
  });

  it('el selector de unidad tiene buscador', async () => {
    await openVisitantes();

    await press(screen.getByRole('button', { name: 'Unidad que autoriza' }));
    expect(screen.getByRole('button', { name: '12' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Administración' })).toBeTruthy();

    // Sin tildes ni mayúsculas, y también por la dirección.
    await fireEvent.changeText(screen.getByLabelText('Buscar unidad que autoriza'), 'ADMINISTRACION');
    expect(screen.getByRole('button', { name: 'Administración' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '12' })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Buscar unidad que autoriza'), 'casa # 56');
    expect(screen.queryByRole('button', { name: 'Administración' })).toBeNull();

    await fireEvent.changeText(screen.getByLabelText('Buscar unidad que autoriza'), 'torre 9');
    expect(screen.getByText('No encontramos unidades con ese nombre.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Buscar unidad que autoriza'), '56');
    await press(screen.getByRole('button', { name: '56' }));
    expect(screen.getByRole('button', { name: 'Unidad que autoriza' })).toHaveAccessibilityValue({ text: '56' });
  });
});

describe('RF10 · entrada', () => {
  it('«Registrar entrada» guarda la hora del servidor y muestra MSG-RF10-01', async () => {
    await openVisitantes();
    await fillValidEntry();
    await fireEvent.changeText(plateField(), 'xyz12a');

    await press(registrar());

    expect(screen.getByTestId('toast-success')).toHaveTextContent(
      MSG.RF10.entryRegistered('Luisa Fernanda Ríos', '56', '09:05 a. m.'),
    );
    // Aparece de primera en «Visitantes dentro».
    expect(screen.getByText('Luisa Fernanda Ríos')).toBeTruthy();
    expect(screen.getByText('Unidad 56 · Entró 09:05 a. m. · XYZ12A')).toBeTruthy();
    // El formulario queda listo para el siguiente visitante.
    expect(nameField().props.value).toBe('');
    expect(documentField().props.value).toBe('');
    expect(plateField().props.value).toBe('');
    expect(screen.getByRole('button', { name: 'Unidad que autoriza' })).toHaveAccessibilityValue({ text: 'Selecciona la unidad' });
  });

  it('la hora no es editable: no hay campo de hora en el formulario', async () => {
    await openVisitantes();
    expect(screen.queryByLabelText(/hora/i)).toBeNull();
  });

  it('no registra otra entrada de un visitante que sigue dentro', async () => {
    await openVisitantes();
    await fireEvent.changeText(nameField(), 'Carlos Mejía');
    await typeDocument('79876543');
    await chooseUnit('12');

    await press(registrar());

    expect(screen.getByText(MSG.RF10.alreadyInside)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
  });
});

describe('RF10 · salida', () => {
  it('«Registrar salida» guarda la hora y muestra MSG-RF10-02', async () => {
    await openVisitantes();
    jest.setSystemTime(new Date(2026, 9, 30, 17, 40));

    await press(screen.getByRole('button', { name: 'Registrar salida de Carlos Mejía' }));

    expect(screen.getByTestId('toast-success')).toHaveTextContent(MSG.RF10.exitRegistered('Carlos Mejía', '05:40 p. m.'));
    expect(screen.queryByText('Carlos Mejía')).toBeNull();
    expect(screen.getByText(MSG.RF10.empty)).toBeTruthy();
  });

  it('sin una entrada activa no registra la salida (MSG-RF10-03)', async () => {
    await openVisitantes();
    // Otro vigilante ya registró la salida mientras tanto.
    await act(() => registerExit('v-2', guard));

    await press(screen.getByRole('button', { name: 'Registrar salida de Carlos Mejía' }));

    expect(screen.getByText(MSG.RF10.noActiveEntry)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
    await pressDialogButton('Aceptar');
    // La lista se recarga con los que de verdad siguen dentro.
    expect(screen.queryByText('Carlos Mejía')).toBeNull();
    expect(screen.getByText(MSG.RF10.empty)).toBeTruthy();
  });

  it('quien entra de nuevo después de salir se puede registrar otra vez', async () => {
    await openVisitantes();
    await press(screen.getByRole('button', { name: 'Registrar salida de Carlos Mejía' }));

    await typeDocument('79876543');
    expect(nameField().props.value).toBe('Carlos Mejía');
    await chooseUnit('12');
    await press(registrar());

    expect(screen.getByTestId('toast-success')).toHaveTextContent(MSG.RF10.entryRegistered('Carlos Mejía', '12', '09:05 a. m.'));
    expect(screen.getByRole('button', { name: 'Registrar salida de Carlos Mejía' })).toBeTruthy();
  });
});
