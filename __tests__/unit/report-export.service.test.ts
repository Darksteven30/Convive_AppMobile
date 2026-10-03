import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { read, utils } from 'xlsx';

import { ALL_CATEGORIES, type FinancialReport, type Movement } from '@/services/finance.service';
import {
  buildReportHtml,
  buildReportWorkbook,
  exportReportExcel,
  exportReportPdf,
  reportFileName,
} from '@/services/report-export.service';

// Los módulos nativos se simulan: en Jest no hay impresora, sistema de archivos ni hoja de compartir.
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  const written: { name: string; content: unknown }[] = [];
  class File {
    name: string;
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
    }
    create() {}
    write(content: unknown) {
      written.push({ name: this.name, content });
    }
  }
  return { File, Paths: { cache: 'cache' }, __written: written };
});

const written: { name: string; content: Uint8Array }[] = jest.requireMock('expo-file-system').__written;
const printToFileAsync = Print.printToFileAsync as jest.Mock;
const isAvailableAsync = Sharing.isAvailableAsync as jest.Mock;
const shareAsync = Sharing.shareAsync as jest.Mock;

const movement = (overrides: Partial<Movement>): Movement => ({
  id: 'm1',
  type: 'ingreso',
  categoryId: 'ing-admin',
  amount: 1_000_000,
  date: '2026-10-01',
  description: 'Recaudo de octubre',
  createdBy: { id: 'u2', name: 'David Muñoz' },
  createdAt: '2026-10-01T14:00:00.000Z',
  ...overrides,
});

const report: FinancialReport = {
  filters: { from: '2026-10-01', to: '2026-10-15', categoryId: ALL_CATEGORIES },
  movements: [
    movement({}),
    movement({ id: 'm2', type: 'egreso', categoryId: 'egr-aseo', amount: 250_000.5, description: 'Aseo <zonas> & jardines' }),
  ],
  totals: { income: 1_000_000, expenses: 250_000.5, balance: 749_999.5 },
  generatedAt: new Date(2026, 9, 15, 18, 19).toISOString(),
  generatedBy: { id: 'u2', name: 'David Muñoz' },
};

beforeEach(() => {
  jest.clearAllMocks();
  written.length = 0;
  isAvailableAsync.mockResolvedValue(true);
  printToFileAsync.mockResolvedValue({ uri: 'file:///cache/print.pdf', numberOfPages: 1 });
});

describe('reportFileName', () => {
  it('incluye el periodo del reporte', () => {
    expect(reportFileName(report, 'pdf')).toBe('reporte-financiero_2026-10-01_2026-10-15.pdf');
    expect(reportFileName(report, 'xlsx')).toBe('reporte-financiero_2026-10-01_2026-10-15.xlsx');
  });
});

describe('buildReportHtml', () => {
  const html = buildReportHtml(report);

  it('incluye periodo, categoría, autor y fecha de generación', () => {
    expect(html).toContain('Periodo: 01/10/2026 – 15/10/2026');
    expect(html).toContain('Categoría: Todas');
    expect(html).toContain('Generado por David Muñoz el 15 oct 2026 - 06:19 p. m.');
  });

  it('incluye los totales y una fila por movimiento con su categoría', () => {
    expect(html).toContain('$ 1.000.000,00');
    expect(html).toContain('$ 250.000,50');
    expect(html).toContain('$ 749.999,50');
    expect(html).toContain('Cuotas de administración');
    expect(html.match(/<tr>/g)).toHaveLength(report.movements.length + 1);
  });

  it('escapa el texto de los conceptos', () => {
    expect(html).toContain('Aseo &lt;zonas&gt; &amp; jardines');
    expect(html).not.toContain('<zonas>');
  });
});

describe('buildReportWorkbook', () => {
  const rows = utils.sheet_to_json<unknown[]>(buildReportWorkbook(report).Sheets.Reporte, { header: 1 });

  it('tiene el encabezado y la tabla de movimientos', () => {
    expect(rows[0]).toEqual(['Convive · Reporte financiero']);
    expect(rows[1]).toEqual(['Periodo', '01/10/2026 – 15/10/2026']);
    expect(rows).toContainEqual(['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Valor (COP)']);
    expect(rows).toContainEqual(['01/10/2026', 'Ingreso', 'Cuotas de administración', 'Recaudo de octubre', 1_000_000]);
  });

  it('guarda los valores como números (egresos en negativo) para poder sumarlos', () => {
    expect(rows).toContainEqual(['01/10/2026', 'Egreso', 'Aseo', 'Aseo <zonas> & jardines', -250_000.5]);
    expect(rows).toContainEqual(['', '', '', 'Saldo del periodo', 749_999.5]);
  });
});

describe('exportReportPdf', () => {
  it('genera el PDF desde HTML y lo abre en la hoja de compartir', async () => {
    await exportReportPdf(report);

    expect(printToFileAsync).toHaveBeenCalledWith({ html: buildReportHtml(report) });
    expect(shareAsync).toHaveBeenCalledWith(
      'file:///cache/print.pdf',
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    );
  });

  it('falla si el dispositivo no permite compartir archivos', async () => {
    isAvailableAsync.mockResolvedValue(false);
    await expect(exportReportPdf(report)).rejects.toThrow('sharing_unavailable');
    expect(shareAsync).not.toHaveBeenCalled();
  });
});

describe('exportReportExcel', () => {
  it('escribe un .xlsx válido en la caché y lo comparte', async () => {
    await exportReportExcel(report);

    expect(written).toHaveLength(1);
    expect(written[0].name).toBe('reporte-financiero_2026-10-01_2026-10-15.xlsx');
    // El archivo escrito se puede volver a leer como libro de Excel.
    const workbook = read(written[0].content, { type: 'array' });
    expect(workbook.SheetNames).toEqual(['Reporte']);

    expect(shareAsync).toHaveBeenCalledWith(
      'file:///cache/reporte-financiero_2026-10-01_2026-10-15.xlsx',
      expect.objectContaining({ mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
  });
});
