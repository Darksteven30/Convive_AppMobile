import { act, fireEvent, screen } from '@testing-library/react-native';
import * as Print from 'expo-print';

import { MSG } from '@/constants/messages';
import { paymentsBackend } from '@/services/payments.mock';
import {
  HISTORY_PAGE_SIZE,
  defaultHistoryFilters,
  getPaymentHistory,
  setMockBalance,
  type PaymentResult,
} from '@/services/payments.service';
import type { User } from '@/services/auth.service';
import { formatMonthYear } from '@/utils/date';

import { navigate, press, renderSignedIn } from '../helpers/app';

// RF02: el comprobante PDF se genera con expo-print y se comparte con expo-sharing.
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/comprobante.pdf' })) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const printToFileAsync = Print.printToFileAsync as jest.Mock;

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const descargar = () => screen.getByRole('button', { name: 'Descargar comprobante' });
const rows = () => screen.queryAllByRole('checkbox');

const monica = { house: '56' } as User;

/** Historial que debe mostrar Pagos con el periodo por defecto (los datos simulados dependen de hoy). */
const expectedHistory = () => getPaymentHistory(monica, defaultHistoryFilters());

async function openPagos(email = 'monica@gmail.com', password = 'Residente123') {
  const app = await renderSignedIn(email, password);
  await navigate('/pagos');
  expect(app.getPathname()).toBe('/pagos');
  return app;
}

afterEach(() => {
  jest.restoreAllMocks();
  printToFileAsync.mockClear();
});

describe('RF02 · Estado de la cuenta', () => {
  it('muestra el saldo pendiente de la unidad con «Abonar»', async () => {
    await openPagos();

    expect(screen.getByText('Estado de la cuenta')).toBeTruthy();
    expect(screen.getByText('$ 45.678,90')).toBeTruthy();
    expect(screen.getByText('Abonar')).toBeTruthy();
    expect(screen.queryByText(MSG.RF02.upToDate)).toBeNull();
  });

  it('con saldo $ 0 muestra «Estás al día» y oculta «Abonar», también en Inicio', async () => {
    // La unidad «Administración» no tiene cartera pendiente.
    await openPagos('admin@convive.com', 'Admin123');
    expect(screen.getByText('$ 0,00')).toBeTruthy();
    expect(screen.getByText(MSG.RF02.upToDate)).toBeTruthy();
    expect(screen.queryByText('Abonar')).toBeNull();

    await navigate('/inicio');
    expect(screen.getByText(MSG.RF02.upToDate)).toBeTruthy();
    expect(screen.queryByText('Abonar')).toBeNull();
  });

  it('MSG-RF02-05: si no se puede cargar el saldo ofrece «Reintentar»', async () => {
    const original = paymentsBackend.getAccountStatus;
    const spy = jest.spyOn(paymentsBackend, 'getAccountStatus').mockRejectedValue(new Error('sin conexión'));

    await openPagos();
    expect(screen.getByText(MSG.RF02.loadFailed)).toBeTruthy();
    expect(screen.queryByText('Abonar')).toBeNull();

    spy.mockImplementation(original);
    await press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.queryByText(MSG.RF02.loadFailed)).toBeNull();
    expect(screen.getByText('$ 45.678,90')).toBeTruthy();
  });

  it('«deslizar hacia abajo» vuelve a consultar el saldo y el historial', async () => {
    await openPagos();
    setMockBalance('56', 'administracion', 0);

    await act(async () => {
      await screen.getByTestId('screen-scroll').props.refreshControl.props.onRefresh();
    });

    expect(screen.getByText('$ 10.678,90')).toBeTruthy();
    expect(rows()).toHaveLength(HISTORY_PAGE_SIZE);
  });
});

describe('RF02 · Historial de pagos', () => {
  it('muestra los pagos aprobados, del más reciente al más antiguo, 12 por página con «Ver más»', async () => {
    const history = await expectedHistory();
    // Los datos simulados siempre tienen más de 12 pagos en los últimos 12 meses.
    expect(history.length).toBeGreaterThan(HISTORY_PAGE_SIZE);

    await openPagos();

    expect(rows()).toHaveLength(HISTORY_PAGE_SIZE);
    const first = history[0];
    expect(rows()[0].props.accessibilityLabel).toContain(formatMonthYear(new Date(first.date)));
    // El más reciente es la llave de la piscina del mes pasado (Otros conceptos con descripción).
    expect(screen.getByText(`${formatMonthYear(new Date(first.date))} — Otros conceptos (Copia de la llave de la piscina)`)).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Ver más' }));
    expect(rows()).toHaveLength(Math.min(history.length, 2 * HISTORY_PAGE_SIZE));
    expect(screen.queryByRole('button', { name: 'Ver más' })).toBeNull();
  });

  it('el periodo por defecto son los últimos 12 meses hasta hoy', async () => {
    await openPagos();
    const { from, to } = defaultHistoryFilters();
    const valueOf = (name: string) => screen.getByRole('button', { name }).props.accessibilityValue.text;
    const ddmmyyyy = (iso: string) => iso.split('-').reverse().join('/');

    expect(valueOf('Fecha inicial')).toBe(ddmmyyyy(from));
    expect(valueOf('Fecha final')).toBe(ddmmyyyy(to));
  });

  it('MSG-RF02-02: la fecha inicial no puede ser mayor que la final', async () => {
    await openPagos();

    // Fecha final: el día 1 de hace 13 meses, antes de la inicial (hace 12 meses).
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() - 13, 1);
    await press(screen.getByRole('button', { name: 'Fecha final' }));
    for (let i = 0; i < 13; i++) {
      await press(screen.getByLabelText('Mes anterior'));
    }
    await press(screen.getByLabelText(`1 de ${MONTHS[target.getMonth()]} de ${target.getFullYear()}`));

    expect(screen.getByText(MSG.RF02.startAfterEnd)).toBeTruthy();
    expect(rows()).toHaveLength(0);
    expect(descargar()).toBeDisabled();
  });

  it('MSG-RF02-01: una unidad sin pagos muestra el estado vacío', async () => {
    // La junta directiva (casa 12) tiene saldo pero ningún pago registrado.
    await openPagos('junta@convive.com', 'Junta123');

    expect(screen.getByText('$ 35.000,00')).toBeTruthy();
    expect(screen.getByText(MSG.RF02.noPayments)).toBeTruthy();
    expect(rows()).toHaveLength(0);
  });

  it('MSG-RF02-05: si no se puede cargar el historial ofrece «Reintentar»', async () => {
    const original = paymentsBackend.getPaymentHistory;
    const spy = jest.spyOn(paymentsBackend, 'getPaymentHistory').mockRejectedValue(new Error('sin conexión'));

    await openPagos();
    expect(screen.getByText(MSG.RF02.loadFailed)).toBeTruthy();
    expect(rows()).toHaveLength(0);

    spy.mockImplementation(original);
    await press(screen.getByRole('button', { name: 'Reintentar' }));
    expect(rows()).toHaveLength(HISTORY_PAGE_SIZE);
  });

  it('un pago nuevo aprobado aparece de primero en el historial', async () => {
    await openPagos();
    await press(screen.getByText('Abonar'));
    await press(screen.getByText('Cuota extraordinaria'));
    await fireEvent.changeText(screen.getByLabelText('Valor a pagar'), '50000');
    await press(screen.getByRole('button', { name: 'Continuar' }));
    await press(screen.getByRole('button', { name: 'Pagar con Wompi' }));
    await press(screen.getByRole('button', { name: 'Nequi' }));
    await press(screen.getByRole('button', { name: 'Pagar' }));
    expect(screen.getByText(MSG.RF13.approvedTitle)).toBeTruthy();

    await navigate('/pagos');
    const label = `${formatMonthYear(new Date())} — Cuota extraordinaria`;
    expect(rows()[0].props.accessibilityLabel).toContain(label);
    expect(rows()[0].props.accessibilityLabel).toContain('$ 50.000,00');
  });
});

describe('RF02 · Descarga del comprobante', () => {
  it('está deshabilitada hasta seleccionar un pago; tocarlo de nuevo lo desmarca', async () => {
    await openPagos();
    expect(descargar()).toBeDisabled();

    await press(rows()[1]);
    expect(rows()[1]).toBeChecked();
    expect(descargar()).toBeEnabled();

    await press(rows()[1]);
    expect(rows()[1]).not.toBeChecked();
    expect(descargar()).toBeDisabled();
  });

  it('solo se marca un pago a la vez', async () => {
    await openPagos();

    await press(rows()[0]);
    await press(rows()[2]);
    expect(rows()[0]).not.toBeChecked();
    expect(rows()[2]).toBeChecked();
  });

  it('MSG-RF02-03: genera el PDF con conjunto, unidad, propietario y los datos del pago', async () => {
    const [, second]: PaymentResult[] = await expectedHistory();
    await openPagos();

    await press(rows()[1]);
    await press(descargar());

    const { html } = printToFileAsync.mock.calls[0][0] as { html: string };
    expect(html).toContain('Conjunto Residencial Convive');
    expect(html).toContain('Casa # 56 Cali - Valle');
    expect(html).toContain('Monica Galvis');
    expect(html).toContain(second.reference);
    expect(html).toContain(second.wompiId);
    expect(html).toContain('<svg');
    expect(screen.getByTestId('toast-success')).toHaveTextContent(MSG.RF02.receiptDownloaded);
  });

  it('MSG-RF02-04: si el PDF falla avisa y deja intentarlo de nuevo', async () => {
    printToFileAsync.mockRejectedValueOnce(new Error('sin espacio'));
    await openPagos();

    await press(rows()[0]);
    await press(descargar());
    expect(screen.getByTestId('toast-error')).toHaveTextContent(MSG.RF02.receiptFailed);
    expect(descargar()).toBeEnabled();
  });
});
