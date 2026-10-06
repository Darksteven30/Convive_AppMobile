import { Platform } from 'react-native';

import type { PaymentResult } from '@/services/payments.service';
import {
  buildReceiptHtml,
  exportReceiptPdf,
  methodLabel,
  receiptFileName,
  receiptRows,
} from '@/services/receipt.service';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(async () => ({ uri: 'file:///cache/comprobante.pdf' })) }));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const Print = jest.requireMock('expo-print') as { printToFileAsync: jest.Mock };
const Sharing = jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };

const user = { name: 'Monica Galvis', address: 'Casa # 56 Cali - Valle' };

const approved: PaymentResult = {
  reference: 'CNV-56-20260909181900-A1B2C3',
  status: 'APROBADA',
  conceptId: 'administracion',
  conceptName: 'Cuota administración',
  description: null,
  amount: 45678.9,
  method: 'NEQUI',
  wompiId: '12345-1757459940-67890',
  // 09 sep 2026, 6:19 p. m. (hora local del dispositivo).
  date: new Date(2026, 8, 9, 18, 19).toISOString(),
};

beforeEach(() => {
  jest.clearAllMocks();
  Platform.OS = 'ios';
});

describe('RF13 · Comprobante de pago', () => {
  it('arma la tabla de detalle con el formato del documento', () => {
    expect(receiptRows(approved)).toEqual([
      ['Concepto', 'Cuota administración'],
      ['Valor pagado', '$ 45.678,90'],
      ['Fecha', '09 sep 2026 - 06:19 p. m.'],
      ['Medio de pago', 'Nequi (vía Wompi)'],
      ['Referencia', 'CNV-56-20260909181900-A1B2C3'],
      ['ID Wompi', '12345-1757459940-67890'],
    ]);
  });

  it('incluye la descripción de «Otros conceptos» y muestra «—» si aún no hay datos de Wompi', () => {
    const rows = receiptRows({
      ...approved,
      conceptName: 'Otros conceptos',
      description: 'Parqueadero',
      method: null,
      wompiId: null,
    });

    expect(rows[0]).toEqual(['Concepto', 'Otros conceptos — Parqueadero']);
    expect(rows[3]).toEqual(['Medio de pago', '—']);
    expect(rows[5]).toEqual(['ID Wompi', '—']);
  });

  it('usa el nombre del medio informado por Wompi', () => {
    expect(methodLabel('CARD')).toBe('Tarjeta crédito/débito (vía Wompi)');
    expect(methodLabel('BANCOLOMBIA_TRANSFER')).toBe('Botón Bancolombia (vía Wompi)');
    // Un medio nuevo de Wompi se muestra tal cual.
    expect(methodLabel('BANCOLOMBIA_QR')).toBe('BANCOLOMBIA_QR (vía Wompi)');
  });

  it('el PDF lleva los datos del pago y escapa el texto', () => {
    const html = buildReceiptHtml(
      { ...approved, conceptName: 'Otros conceptos', description: '<b>Parqueadero</b>' },
      user,
    );

    expect(html).toContain('Comprobante de pago');
    expect(html).toContain('Pago exitoso');
    expect(html).toContain('CNV-56-20260909181900-A1B2C3');
    expect(html).toContain('$ 45.678,90');
    expect(html).toContain('Monica Galvis');
    expect(html).toContain('&lt;b&gt;Parqueadero&lt;/b&gt;');
    expect(html).not.toContain('<b>Parqueadero</b>');
    expect(receiptFileName(approved)).toBe('comprobante_CNV-56-20260909181900-A1B2C3.pdf');
  });

  it('genera el PDF y lo comparte en el celular', async () => {
    await exportReceiptPdf(approved, user);

    expect(Print.printToFileAsync).toHaveBeenCalledWith({ html: expect.stringContaining(approved.reference) });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/comprobante.pdf', {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Comprobante de pago',
    });
  });

  it('solo existe para pagos APROBADOS', async () => {
    for (const status of ['RECHAZADA', 'PENDIENTE', 'ERROR', 'ANULADA', 'CANCELADA'] as const) {
      await expect(exportReceiptPdf({ ...approved, status }, user)).rejects.toThrow('receipt_only_approved');
    }
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });

  it('en web abre el diálogo de impresión («Guardar como PDF»)', async () => {
    Platform.OS = 'web';
    const printWindow = { document: { write: jest.fn(), close: jest.fn() }, focus: jest.fn(), print: jest.fn() };
    const open = jest.fn(() => printWindow);
    Object.defineProperty(globalThis, 'window', { value: { open }, configurable: true });

    await exportReceiptPdf(approved, user);

    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(printWindow.document.write).toHaveBeenCalledWith(expect.stringContaining(approved.reference));
    expect(printWindow.print).toHaveBeenCalled();
    expect(Print.printToFileAsync).not.toHaveBeenCalled();
  });
});
