// RF13 · Comprobante de pago en PDF. Solo existe para pagos APROBADOS.
// - Celular: el PDF se genera con expo-print a partir de HTML y se abre en la hoja de compartir.
// - Web: se imprime desde una ventana nueva («Guardar como PDF»).
// Mismo enfoque que la exportación de reportes (report-export.service.ts).

import { Platform } from 'react-native';
import * as Print from 'expo-print';

import type { User } from '@/services/auth.types';
import { WOMPI_METHOD_LABELS, type PaymentResult, type WompiMethod } from '@/services/payments.service';
import { shareFile } from '@/services/report-export.service';
import { formatDateTime } from '@/utils/date';
import { formatAmount } from '@/utils/money';

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Medio que informó Wompi, p. ej. «Nequi (vía Wompi)». */
export function methodLabel(method: string | null): string {
  if (!method) return '—';
  return `${WOMPI_METHOD_LABELS[method as WompiMethod] ?? method} (vía Wompi)`;
}

/** Filas de la tabla de detalle (pantalla de resultado y comprobante). */
export function receiptRows(result: PaymentResult): [string, string][] {
  return [
    ['Concepto', result.description ? `${result.conceptName} — ${result.description}` : result.conceptName],
    ['Valor pagado', formatAmount(result.amount)],
    ['Fecha', formatDateTime(new Date(result.date))],
    ['Medio de pago', methodLabel(result.method)],
    ['Referencia', result.reference],
    ['ID Wompi', result.wompiId ?? '—'],
  ];
}

/** «comprobante_CNV-56-20261006103000-A1B2C3.pdf» */
export function receiptFileName(result: PaymentResult): string {
  return `comprobante_${result.reference}.pdf`;
}

/** Documento HTML del comprobante, que expo-print convierte en PDF. */
export function buildReceiptHtml(result: PaymentResult, user: Pick<User, 'name' | 'address'>): string {
  const rows = receiptRows(result)
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Comprobante de pago</title>
  <style>
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; font-size: 13px; }
    h1 { color: #0F766E; font-size: 22px; margin: 0; }
    .status { display: inline-block; margin: 12px 0; padding: 4px 12px; border-radius: 999px; background: #DCFCE7; color: #166534; font-weight: 600; }
    .meta { color: #555; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e5e5e5; }
    th { width: 35%; color: #555; font-weight: 500; }
    .footer { margin-top: 24px; color: #777; font-size: 11px; }
  </style>
</head>
<body>
  <h1>Convive</h1>
  <p class="meta">Comprobante de pago</p>
  <p class="meta">${escapeHtml(user.name)} · ${escapeHtml(user.address)}</p>
  <span class="status">Pago exitoso</span>
  <table>${rows}</table>
  <p class="footer">Pago procesado por Wompi. Generado el ${formatDateTime(new Date())}.</p>
</body>
</html>`;
}

/** Genera el comprobante y lo comparte (en web abre el diálogo de impresión). Solo pagos APROBADOS. */
export async function exportReceiptPdf(result: PaymentResult, user: Pick<User, 'name' | 'address'>): Promise<void> {
  if (result.status !== 'APROBADA') {
    throw new Error('receipt_only_approved');
  }
  const html = buildReceiptHtml(result, user);

  if (Platform.OS === 'web') {
    const printWindow = window.open('', '_blank');
    if (!printWindow) throw new Error('popup_blocked');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  await shareFile(uri, 'application/pdf', 'com.adobe.pdf', 'Comprobante de pago');
}
