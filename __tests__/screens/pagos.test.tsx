import { act, fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import { paymentsBackend } from '@/services/payments.mock';
import { PaymentError, getMockTransactions, setMockBalance, setMockGateway } from '@/services/payments.service';

import { navigate, press, pressDialogButton, renderSignedIn } from '../helpers/app';

const continuar = () => screen.getByRole('button', { name: 'Continuar' });
const valor = () => screen.getByLabelText('Valor a pagar');
const pagarConWompi = () => screen.getByRole('button', { name: 'Pagar con Wompi' });

async function typeAmount(text: string) {
  await fireEvent.changeText(valor(), text);
}

/** Residente de la casa 56 con saldo: administración $35.000, extraordinaria sin saldo y otros $10.678,90. */
async function signInResident() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  setMockBalance('56', 'administracion', 35000);
  setMockBalance('56', 'otros', 10678.9);
  return app;
}

async function openSelectionAsResident() {
  const app = await signInResident();
  await press(screen.getByText('Abonar'));
  expect(app.getPathname()).toBe('/pago/seleccion');
  return app;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Flujo de pago', () => {
  it('completa el pago con un abono parcial: concepto y valor → Wompi → confirmación', async () => {
    const app = await openSelectionAsResident();
    expect(screen.getByText('Efectuar pago')).toBeTruthy();
    expect(screen.getByText('$45.678,90')).toBeTruthy();

    // Paso 1: no se puede continuar sin elegir concepto.
    expect(continuar()).toBeDisabled();
    await press(screen.getByText('Cuota administración'));
    // Por defecto se propone el saldo completo del concepto.
    expect(valor()).toHaveDisplayValue('$ 35.000,00');
    expect(screen.getByText(MSG.RF11.partialHint)).toBeTruthy();
    expect(continuar()).toBeEnabled();

    await typeAmount('20000,5');
    expect(valor()).toHaveDisplayValue('$ 20.000,5');
    await press(continuar());

    // Paso 2: resumen con el concepto y el valor elegidos (no el saldo total).
    expect(app.getPathname()).toBe('/pago/aplicar');
    expect(screen.getByText('Cuota administración')).toBeTruthy();
    expect(screen.getByText('$20.000,50')).toBeTruthy();
    await press(pagarConWompi());
    await press(screen.getByRole('button', { name: 'Nequi' }));
    await press(screen.getByRole('button', { name: 'Pagar' }));

    // Paso 3: comprobante con los datos del pago.
    expect(app.getPathname()).toBe('/pago/confirmacion');
    expect(screen.getByText('Pago exitoso')).toBeTruthy();
    expect(screen.getByText('Cuota administración')).toBeTruthy();
    expect(screen.getByText('$20.000,50')).toBeTruthy();
    expect(screen.getByText('Nequi (vía Wompi)')).toBeTruthy();
    expect(screen.getByText(/^CNV-56-\d{14}-\d{6}$/)).toBeTruthy();
    expect(screen.getByText(/^\d{5}-\d{10}-\d{5}$/)).toBeTruthy();

    await press(screen.getByText('Volver al inicio'));
    expect(app.getPathname()).toBe('/inicio');
  });

  it('"Cancelar" en Aplicar abandona el pago y lleva a Pagos aunque se abriera desde Inicio', async () => {
    const app = await openSelectionAsResident();
    await press(screen.getByText('Cuota administración'));
    await press(continuar());
    expect(app.getPathname()).toBe('/pago/aplicar');

    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/pagos');
    expect(screen.getByText('Historial de pagos')).toBeTruthy();
  });

  it('"Cancelar" en Aplicar lleva a Pagos cuando el pago se abrió desde Pagos', async () => {
    const app = await signInResident();
    await press(screen.getByText('Pagos'));
    await press(screen.getByText('Abonar'));
    await press(screen.getByText('Cuota administración'));
    await press(continuar());

    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/pagos');
    expect(screen.getByText('Historial de pagos')).toBeTruthy();
  });

  it('la sección Pagos muestra el estado de la cuenta y el historial', async () => {
    await signInResident();

    await press(screen.getByText('Pagos'));
    expect(screen.getByText('$45.678,90')).toBeTruthy();
    expect(screen.getByText('Historial de pagos')).toBeTruthy();
    expect(screen.getByText('Ago 2026 — Cuota admón.')).toBeTruthy();
    expect(screen.getByText('Jun 2026 — Cuota admón.')).toBeTruthy();
  });
});

describe('RF11 · Selección del concepto de pago', () => {
  it('muestra el saldo pendiente debajo de cada concepto', async () => {
    await openSelectionAsResident();

    expect(screen.getByText('Saldo pendiente: $35.000,00')).toBeTruthy();
    expect(screen.getByText('Sin saldo pendiente')).toBeTruthy();
    expect(screen.getByText('Saldo pendiente: $10.678,90')).toBeTruthy();
  });

  it('el estado de la cuenta y los saldos salen del servicio, no de una constante', async () => {
    await signInResident();
    setMockBalance('56', 'administracion', 0);

    await press(screen.getByText('Pagos'));
    expect(screen.getByText('$10.678,90')).toBeTruthy();

    await press(screen.getByText('Abonar'));
    expect(screen.getAllByText('Sin saldo pendiente')).toHaveLength(2);
  });

  it('MSG-RF11-01: al tocar «Continuar» sin concepto explica qué falta', async () => {
    await openSelectionAsResident();

    await press(continuar());
    expect(screen.getByText(MSG.RF11.conceptRequired)).toBeTruthy();

    await press(screen.getByText('Cuota administración'));
    expect(screen.queryByText(MSG.RF11.conceptRequired)).toBeNull();
  });

  it('MSG-RF11-02: el valor debe ser mayor a $ 0', async () => {
    await openSelectionAsResident();
    await press(screen.getByText('Cuota administración'));

    await typeAmount('0');
    expect(screen.getByText('El valor debe ser mayor a $ 0.')).toBeTruthy();
    expect(continuar()).toBeDisabled();

    await typeAmount('');
    expect(screen.getByText(MSG.RF11.amountInvalid)).toBeTruthy();
    expect(continuar()).toBeDisabled();
  });

  it('MSG-RF11-03: el valor no puede superar el saldo del concepto', async () => {
    await openSelectionAsResident();
    await press(screen.getByText('Otros conceptos'));
    await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Parqueadero de visitantes');

    await typeAmount('10678,91');
    expect(
      screen.getByText('El valor no puede superar el saldo pendiente de este concepto ($ 10.678,90).'),
    ).toBeTruthy();
    expect(continuar()).toBeDisabled();

    await typeAmount('10678,90');
    expect(continuar()).toBeEnabled();
  });

  it('un concepto sin saldo se puede elegir y acepta el valor que la persona escriba', async () => {
    const app = await openSelectionAsResident();
    await press(screen.getByText('Cuota extraordinaria'));

    // Arranca vacío y sin mensaje de error hasta que escriban o intenten continuar.
    expect(valor()).toHaveDisplayValue('');
    expect(screen.getByText(MSG.RF11.noBalanceHint)).toBeTruthy();
    expect(screen.queryByText(MSG.RF11.amountInvalid)).toBeNull();
    expect(continuar()).toBeDisabled();

    await press(continuar());
    expect(screen.getByText(MSG.RF11.amountInvalid)).toBeTruthy();

    await typeAmount('50000');
    expect(continuar()).toBeEnabled();
    await press(continuar());
    expect(app.getPathname()).toBe('/pago/aplicar');
    expect(screen.getByText('Cuota extraordinaria')).toBeTruthy();
    expect(screen.getByText('$50.000,00')).toBeTruthy();
  });

  it('«Otros conceptos» pide una descripción de 5 a 100 caracteres y la pasa a Aplicar', async () => {
    const app = await openSelectionAsResident();
    await press(screen.getByText('Otros conceptos'));
    expect(valor()).toHaveDisplayValue('$ 10.678,90');
    expect(continuar()).toBeDisabled();

    const descripcion = screen.getByLabelText('Descripción');
    await fireEvent.changeText(descripcion, 'Abc');
    await fireEvent(descripcion, 'blur');
    expect(screen.getByText(MSG.RF11.descriptionLength)).toBeTruthy();
    expect(continuar()).toBeDisabled();

    await fireEvent.changeText(descripcion, 'Parqueadero de visitantes');
    expect(screen.queryByText(MSG.RF11.descriptionLength)).toBeNull();
    await press(continuar());

    expect(app.getPathname()).toBe('/pago/aplicar');
    expect(screen.getByText('Otros conceptos')).toBeTruthy();
    expect(screen.getByText('Parqueadero de visitantes')).toBeTruthy();
    expect(screen.getByText('$10.678,90')).toBeTruthy();
  });

  it('MSG-RF11-05: si la unidad está al día muestra el estado vacío y deja pagar otros valores', async () => {
    // El administrador (unidad «Administración») no tiene saldo pendiente.
    await renderSignedIn('admin@convive.com', 'Admin123');
    await navigate('/inicio');
    await press(screen.getByText('Abonar'));

    expect(screen.getByText('$0,00')).toBeTruthy();
    expect(screen.getByText(MSG.RF11.upToDateTitle)).toBeTruthy();
    expect(screen.getByText(MSG.RF11.upToDateMessage)).toBeTruthy();
    expect(screen.getAllByText('Sin saldo pendiente')).toHaveLength(3);
  });

  it('"Cancelar" vuelve a Pagos cuando el pago se abrió desde Pagos', async () => {
    const app = await signInResident();
    await press(screen.getByText('Pagos'));
    await press(screen.getByText('Abonar'));
    await press(screen.getByText('Cuota administración'));

    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/pagos');
  });

  it('"Cancelar" vuelve a Inicio cuando el pago se abrió desde Inicio', async () => {
    const app = await openSelectionAsResident();

    await press(screen.getByLabelText('Cancelar'));
    expect(app.getPathname()).toBe('/inicio');
  });

  it('si no se puede consultar el saldo muestra el error y permite reintentar', async () => {
    const original = paymentsBackend.getAccountStatus;
    const spy = jest.spyOn(paymentsBackend, 'getAccountStatus').mockRejectedValue(new Error('sin conexión'));

    await openSelectionAsResident();
    expect(screen.getByText(MSG.general.unexpected)).toBeTruthy();
    expect(screen.queryByText('Seleccione el concepto')).toBeNull();

    spy.mockImplementation(original);
    await press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('Seleccione el concepto')).toBeTruthy();
    expect(screen.getByText('$45.678,90')).toBeTruthy();
  });
});

describe('RF12 · Pago a través de la pasarela Wompi', () => {
  /** Abre «Aplicar» con la cuota de administración completa ($35.000). setup prepara Wompi antes de entrar. */
  async function openApplyAsResident(setup?: () => void) {
    const app = await openSelectionAsResident();
    setup?.();
    await press(screen.getByText('Cuota administración'));
    await press(continuar());
    expect(app.getPathname()).toBe('/pago/aplicar');
    return app;
  }

  it('muestra el botón «Pagar con Wompi», los medios del conjunto y el texto de seguridad (sin PSE/Tarjeta/Nequi)', async () => {
    await openApplyAsResident(() => setMockGateway({ methods: ['CARD', 'PSE', 'NEQUI'] }));

    expect(screen.getByText('Medio de pago')).toBeTruthy();
    expect(pagarConWompi()).toBeEnabled();
    expect(screen.getByText('Medios disponibles en Wompi')).toBeTruthy();
    expect(screen.getByText('Tarjeta crédito/débito')).toBeTruthy();
    expect(screen.getByText('PSE')).toBeTruthy();
    expect(screen.getByText('Nequi')).toBeTruthy();
    // Solo los medios habilitados en la cuenta Wompi del conjunto.
    expect(screen.queryByText('Daviplata')).toBeNull();
    expect(screen.getByText(`🔒 ${MSG.RF12.securityNote}`)).toBeTruthy();
    // Los medios ya no se eligen en la app: los chips no son botones.
    expect(screen.queryByRole('button', { name: 'PSE' })).toBeNull();
    expect(screen.queryByText('Seleccione el medio de pago')).toBeNull();
  });

  it('al pulsar crea la transacción PENDIENTE y abre Wompi con el valor no editable', async () => {
    await openApplyAsResident();

    await press(pagarConWompi());

    const [transaction] = getMockTransactions();
    expect(transaction).toMatchObject({ conceptId: 'administracion', amountInCents: 3500000, status: 'PENDIENTE' });
    expect(screen.getByText('Wompi')).toBeTruthy();
    expect(screen.getByText(`Referencia ${transaction.reference}`)).toBeTruthy();
    expect(screen.getAllByText('$35.000,00').length).toBeGreaterThan(0);
    // El valor solo se muestra: no hay campo para cambiarlo y el medio se elige dentro de Wompi.
    expect(screen.queryByLabelText('Valor a pagar')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pagar' })).toBeDisabled();
  });

  it('muestra «Procesando…» y deshabilita el botón mientras el servidor crea la transacción', async () => {
    await openApplyAsResident();
    // El servidor no responde hasta que la prueba lo decida (y falla, para terminar con MSG-RF12-01).
    let respond: (error: Error) => void = () => undefined;
    jest
      .spyOn(paymentsBackend, 'startPayment')
      .mockReturnValue(new Promise((_resolve, reject) => (respond = reject)));

    // fireEvent devuelve la promesa del onPress: se espera solo cuando el servidor responda.
    const pressing = fireEvent.press(pagarConWompi());
    // Deja que cierre el act() de la pulsación (sin abrir otro encima).
    for (let i = 0; i < 10; i += 1) await Promise.resolve();

    expect(screen.getByRole('button', { name: 'Procesando…' })).toBeDisabled();
    await act(async () => respond(new Error('sin conexión')));
    await pressing;
    expect(pagarConWompi()).toBeEnabled();
    expect(screen.getByText(MSG.RF12.startFailed)).toBeTruthy();
  });

  it('MSG-RF12-02: cerrar Wompi sin pagar cancela la transacción y avisa que no hubo cobro', async () => {
    const app = await openApplyAsResident();
    await press(pagarConWompi());

    await press(screen.getByLabelText('Cerrar ventana de Wompi'));

    expect(screen.getByText(MSG.RF12.cancelled)).toBeTruthy();
    expect(getMockTransactions()[0].status).toBe('CANCELADA');
    expect(app.getPathname()).toBe('/pago/aplicar');
    // Se puede volver a intentar con una referencia nueva.
    await press(pagarConWompi());
    expect(getMockTransactions()).toHaveLength(2);
  });

  it('MSG-RF12-03: bloquea un segundo pago del mismo concepto y «Ver estado» lleva a Pagos', async () => {
    const app = await openApplyAsResident();
    await press(pagarConWompi());
    await press(screen.getByRole('button', { name: 'PSE' }));
    await press(screen.getByRole('button', { name: 'Pagar' }));
    expect(app.getPathname()).toBe('/pago/confirmacion');

    // Intenta pagar de nuevo la administración mientras el primer pago sigue PENDIENTE.
    await press(screen.getByText('Volver al inicio'));
    await press(screen.getByText('Abonar'));
    await press(screen.getByText('Cuota administración'));
    await press(continuar());
    await press(pagarConWompi());

    expect(screen.getByText(MSG.RF12.pendingPayment)).toBeTruthy();
    expect(getMockTransactions()).toHaveLength(1);
    expect(screen.queryByText(/^Referencia /)).toBeNull();

    await pressDialogButton('Ver estado');
    expect(app.getPathname()).toBe('/pagos');
  });

  it('MSG-RF12-03: «Aceptar» cierra el aviso y se queda en Aplicar', async () => {
    const app = await openApplyAsResident();
    await press(pagarConWompi());
    await press(screen.getByLabelText('Cerrar ventana de Wompi'));
    // Un pago PENDIENTE de la administración creado en otro dispositivo.
    jest.spyOn(paymentsBackend, 'startPayment').mockRejectedValueOnce(new PaymentError('pending', 't9'));

    await press(pagarConWompi());
    await pressDialogButton('Aceptar');

    expect(screen.queryByText(MSG.RF12.pendingPayment)).toBeNull();
    expect(app.getPathname()).toBe('/pago/aplicar');
  });

  it('MSG-RF12-04: si Wompi no está disponible muestra el diálogo y no crea la transacción', async () => {
    await openApplyAsResident(() => setMockGateway({ available: false }));

    await press(pagarConWompi());

    expect(screen.getByText(MSG.RF12.unavailable)).toBeTruthy();
    expect(getMockTransactions()).toHaveLength(0);
    await pressDialogButton('Aceptar');
    expect(screen.queryByText(MSG.RF12.unavailable)).toBeNull();
  });

  it('MSG-RF12-01: si no se pudo crear la transacción o la firma muestra el error', async () => {
    await openApplyAsResident();
    jest.spyOn(paymentsBackend, 'startPayment').mockRejectedValueOnce(new Error('sin conexión'));

    await press(pagarConWompi());

    expect(screen.getByText(MSG.RF12.startFailed)).toBeTruthy();
    expect(pagarConWompi()).toBeEnabled();
  });

  it('«Volver» regresa a Selección sin crear transacción', async () => {
    const app = await openApplyAsResident();

    await press(screen.getByRole('button', { name: 'Volver' }));

    expect(app.getPathname()).toBe('/pago/seleccion');
    expect(getMockTransactions()).toHaveLength(0);
  });

  it('«Otros conceptos» envía la descripción con el pago', async () => {
    await openSelectionAsResident();
    await press(screen.getByText('Otros conceptos'));
    await fireEvent.changeText(screen.getByLabelText('Descripción'), 'Parqueadero de visitantes');
    await press(continuar());

    await press(pagarConWompi());

    expect(getMockTransactions()[0]).toMatchObject({
      conceptId: 'otros',
      description: 'Parqueadero de visitantes',
      amount: 10678.9,
    });
  });
});
