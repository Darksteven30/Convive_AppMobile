import { screen, within } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { MSG } from '@/constants/messages';

import { navigate, press, renderSignedIn } from '../helpers/app';

// Los módulos nativos de la exportación se simulan: en Jest no hay impresora ni hoja de compartir.
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  File: class {
    uri = 'file:///cache/reporte.xlsx';
    create() {}
    write() {}
  },
  Paths: { cache: 'cache' },
}));

const printToFileAsync = Print.printToFileAsync as jest.Mock;
const isAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// «Hoy» fijo en las pruebas: 15 de octubre de 2026.
const TODAY = new Date(2026, 9, 15, 10, 0);

const generar = () => screen.getByRole('button', { name: 'Generar' });

/** Entra como administrador y abre Reportes desde el Panel. */
async function openAsAdmin() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  jest.setSystemTime(TODAY);
  await press(screen.getByText('Reportes'));
  expect(app.getPathname()).toBe('/reportes');
  return app;
}

/**
 * Elige una fecha en el calendario del campo indicado.
 * `monthsBack` es cuántos meses retroceder desde el mes que muestra el campo.
 */
async function pickDate(field: 'Fecha inicial' | 'Fecha final', date: Date, monthsBack = 0) {
  await press(screen.getByRole('button', { name: field }));
  for (let i = 0; i < monthsBack; i++) {
    await press(screen.getByLabelText('Mes anterior'));
  }
  await press(screen.getByLabelText(`${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`));
}

async function chooseCategory(label: string) {
  await press(screen.getByRole('button', { name: 'Categoría' }));
  await press(screen.getByText(label));
}

const totals = () => within(screen.getByLabelText('Totales del periodo'));

beforeEach(() => {
  isAvailableAsync.mockResolvedValue(true);
  printToFileAsync.mockResolvedValue({ uri: 'file:///cache/print.pdf', numberOfPages: 1 });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('RF04 · acceso', () => {
  it('la junta directiva abre los reportes desde General (solo lectura)', async () => {
    const app = await renderSignedIn('junta@convive.com', 'Junta123');
    jest.setSystemTime(TODAY);
    expect(app.getPathname()).toBe('/general');

    await press(screen.getByText('Ver reportes financieros'));
    expect(app.getPathname()).toBe('/reportes');

    await press(generar());
    expect(totals().getByText('$ 2.150.000,00')).toBeTruthy();
  });

  it.each([
    ['propietario', 'monica@gmail.com', 'Residente123'],
    ['vigilancia', 'vigilancia@convive.com', 'Vigilancia123'],
  ])('%s no puede abrir Reportes por ruta directa', async (_role, email, password) => {
    const app = await renderSignedIn(email, password);
    await navigate('/reportes');
    expect(app.getPathname()).not.toBe('/reportes');
  });
});

describe('RF04 · filtros', () => {
  it('por defecto: del primer día del mes a hoy y todas las categorías', async () => {
    await openAsAdmin();

    const valueOf = (name: string) => screen.getByRole('button', { name }).props.accessibilityValue.text;
    expect(valueOf('Fecha inicial')).toBe('01/10/2026');
    expect(valueOf('Fecha final')).toBe('15/10/2026');
    expect(valueOf('Categoría')).toBe('Todas');
    expect(generar()).toBeEnabled();
  });

  it('no se pueden elegir fechas posteriores a hoy', async () => {
    await openAsAdmin();
    await press(screen.getByRole('button', { name: 'Fecha final' }));
    expect(screen.getByLabelText('16 de Oct de 2026')).toBeDisabled();
  });

  it('MSG-RF04-02: la fecha inicial no puede ser mayor que la final', async () => {
    await openAsAdmin();
    await pickDate('Fecha inicial', new Date(2026, 9, 10));
    await pickDate('Fecha final', new Date(2026, 9, 5));

    expect(screen.getByText(MSG.RF04.startAfterEnd)).toBeTruthy();
    expect(generar()).toBeDisabled();

    // El mensaje desaparece al corregir el dato.
    await pickDate('Fecha final', new Date(2026, 9, 12));
    expect(screen.queryByText(MSG.RF04.startAfterEnd)).toBeNull();
    expect(generar()).toBeEnabled();
  });

  it('MSG-RF04-03: el rango máximo es de 12 meses', async () => {
    await openAsAdmin();
    await pickDate('Fecha inicial', new Date(2025, 9, 14), 12);

    expect(screen.getByText(MSG.RF04.rangeTooLong)).toBeTruthy();
    expect(generar()).toBeDisabled();

    await pickDate('Fecha inicial', new Date(2025, 9, 15));
    expect(screen.queryByText(MSG.RF04.rangeTooLong)).toBeNull();
  });
});

describe('RF04 · generar', () => {
  it('muestra los movimientos del periodo con los totales de ingresos, egresos y saldo', async () => {
    await openAsAdmin();
    await press(generar());

    expect(totals().getByText('$ 2.150.000,00')).toBeTruthy();
    expect(totals().getByText('$ 320.000,00')).toBeTruthy();
    expect(totals().getByText('$ 1.830.000,00')).toBeTruthy();
    expect(screen.getByText('Recaudo parcial cuotas de administración octubre')).toBeTruthy();
    expect(screen.getByText('Insumos de limpieza para zonas comunes')).toBeTruthy();
    expect(screen.getByText(/2 movimientos/)).toBeTruthy();
  });

  it('filtra por categoría en un rango de varios meses', async () => {
    await openAsAdmin();
    await pickDate('Fecha inicial', new Date(2026, 6, 1), 3);
    await chooseCategory('Nómina · Egreso');
    await press(generar());

    expect(screen.getByText(/3 movimientos/)).toBeTruthy();
    expect(screen.getByText('Nómina de julio del personal de aseo y portería')).toBeTruthy();
    expect(screen.getByText('Nómina de septiembre del personal de aseo y portería')).toBeTruthy();
    expect(screen.queryByText('Recaudo cuotas de administración agosto')).toBeNull();
    expect(totals().getByText('$ 9.600.000,00')).toBeTruthy();
    expect(totals().getByText('-$ 9.600.000,00')).toBeTruthy();
  });

  it('MSG-RF04-01: sin datos muestra el estado vacío y no permite exportar', async () => {
    await openAsAdmin();
    await chooseCategory('Alquiler de zonas comunes · Ingreso');
    await press(generar());

    expect(screen.getByText(MSG.RF04.noData)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeDisabled();
  });

  it('al cambiar un filtro se oculta el reporte anterior hasta volver a generarlo', async () => {
    await openAsAdmin();
    await press(generar());
    expect(screen.getByLabelText('Totales del periodo')).toBeTruthy();

    await chooseCategory('Aseo · Egreso');
    expect(screen.queryByLabelText('Totales del periodo')).toBeNull();
  });
});

describe('RF04 · exportar', () => {
  it('MSG-RF04-04: exporta a PDF y lo comparte', async () => {
    await openAsAdmin();
    await press(generar());
    await press(screen.getByRole('button', { name: 'Exportar PDF' }));

    expect(printToFileAsync).toHaveBeenCalledWith({ html: expect.stringContaining('Reporte financiero') });
    expect(shareAsync).toHaveBeenCalledWith('file:///cache/print.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
    expect(screen.getByText(MSG.RF04.exported)).toBeTruthy();
  });

  it('MSG-RF04-04: exporta a Excel y lo comparte', async () => {
    await openAsAdmin();
    await press(generar());
    await press(screen.getByRole('button', { name: 'Exportar Excel' }));

    expect(shareAsync).toHaveBeenCalledWith('file:///cache/reporte.xlsx', expect.anything());
    expect(screen.getByText(MSG.RF04.exported)).toBeTruthy();
  });

  it('MSG-RF04-05: si la exportación falla avisa con un Toast de error', async () => {
    isAvailableAsync.mockResolvedValue(false);
    await openAsAdmin();
    await press(generar());
    await press(screen.getByRole('button', { name: 'Exportar Excel' }));

    expect(screen.getByText(MSG.RF04.exportFailed)).toBeTruthy();
    expect(shareAsync).not.toHaveBeenCalled();
  });
});
