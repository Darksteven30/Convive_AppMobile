// Exportación del reporte financiero (RF04) a PDF y Excel.
// - Celular: el PDF se genera con expo-print a partir de HTML y el Excel con SheetJS; ambos se
//   guardan en la caché y se abren en la hoja de compartir del sistema (guardar, enviar por correo…).
// - Web: el PDF se imprime desde una ventana nueva («Guardar como PDF») y el Excel se descarga.

import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { utils, write, writeFile, type WorkBook } from 'xlsx';

import { ALL_CATEGORIES, findCategory, type FinancialReport } from '@/services/finance.service';
import { formatDate, formatDateTime } from '@/utils/date';
import { formatAmount } from '@/utils/money';

const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const typeLabel = (type: string) => (type === 'ingreso' ? 'Ingreso' : 'Egreso');

export function categoryLabel(categoryId: string): string {
  return categoryId === ALL_CATEGORIES ? 'Todas' : (findCategory(categoryId)?.name ?? 'Sin categoría');
}

/** «reporte-financiero_2026-10-01_2026-10-03.pdf» */
export function reportFileName(report: FinancialReport, extension: 'pdf' | 'xlsx'): string {
  return `reporte-financiero_${report.filters.from}_${report.filters.to}.${extension}`;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Documento HTML del reporte, que expo-print convierte en PDF. */
export function buildReportHtml(report: FinancialReport): string {
  const { filters, totals } = report;
  const rows = report.movements
    .map(
      (item) => `
        <tr>
          <td>${formatDate(item.date)}</td>
          <td>${typeLabel(item.type)}</td>
          <td>${escapeHtml(categoryLabel(item.categoryId))}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="amount ${item.type}">${item.type === 'egreso' ? '−' : ''}${formatAmount(item.amount)}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Reporte financiero</title>
  <style>
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 32px; font-size: 12px; }
    h1 { color: #0F766E; font-size: 22px; margin: 0; }
    h2 { font-size: 16px; margin: 4px 0 16px; }
    .meta { color: #555; margin: 2px 0; }
    .totals { display: flex; gap: 12px; margin: 20px 0; }
    .total { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
    .total span { display: block; color: #555; }
    .total strong { font-size: 15px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #0F766E; color: #fff; text-align: left; padding: 6px; }
    td { border-bottom: 1px solid #e5e5e5; padding: 6px; vertical-align: top; }
    .amount { text-align: right; white-space: nowrap; }
    .ingreso { color: #16A34A; }
    .egreso { color: #DC2626; }
  </style>
</head>
<body>
  <h1>Convive</h1>
  <h2>Reporte financiero</h2>
  <p class="meta">Periodo: ${formatDate(filters.from)} – ${formatDate(filters.to)}</p>
  <p class="meta">Categoría: ${escapeHtml(categoryLabel(filters.categoryId))}</p>
  <p class="meta">Generado por ${escapeHtml(report.generatedBy.name)} el ${formatDateTime(new Date(report.generatedAt))}</p>
  <div class="totals">
    <div class="total"><span>Total ingresos</span><strong class="ingreso">${formatAmount(totals.income)}</strong></div>
    <div class="total"><span>Total egresos</span><strong class="egreso">${formatAmount(totals.expenses)}</strong></div>
    <div class="total"><span>Saldo del periodo</span><strong>${formatAmount(totals.balance)}</strong></div>
  </div>
  <table>
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Concepto</th><th class="amount">Valor</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

/** Libro de Excel con una hoja: encabezado del reporte, tabla de movimientos y totales. */
export function buildReportWorkbook(report: FinancialReport): WorkBook {
  const { filters, totals } = report;
  const header = [
    ['Convive · Reporte financiero'],
    ['Periodo', `${formatDate(filters.from)} – ${formatDate(filters.to)}`],
    ['Categoría', categoryLabel(filters.categoryId)],
    ['Generado', `${report.generatedBy.name} · ${formatDateTime(new Date(report.generatedAt))}`],
    [],
    ['Fecha', 'Tipo', 'Categoría', 'Concepto', 'Valor (COP)'],
  ];
  // El valor se guarda como número (los egresos en negativo) para que se pueda sumar en Excel.
  const rows = report.movements.map((item) => [
    formatDate(item.date),
    typeLabel(item.type),
    categoryLabel(item.categoryId),
    item.description,
    item.type === 'egreso' ? -item.amount : item.amount,
  ]);
  const footer = [
    [],
    ['', '', '', 'Total ingresos', totals.income],
    ['', '', '', 'Total egresos', -totals.expenses],
    ['', '', '', 'Saldo del periodo', totals.balance],
  ];

  const sheet = utils.aoa_to_sheet([...header, ...rows, ...footer]);
  sheet['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 50 }, { wch: 16 }];
  // Formato de moneda en la columna de valores (E), desde la tabla hasta los totales.
  const firstValueRow = header.length;
  const lastRow = header.length + rows.length + footer.length;
  for (let row = firstValueRow; row < lastRow; row++) {
    const cell = sheet[utils.encode_cell({ r: row, c: 4 })];
    if (cell && cell.t === 'n') cell.z = '"$" #,##0.00';
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Reporte');
  return workbook;
}

async function shareFile(uri: string, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('sharing_unavailable');
  }
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Reporte financiero' });
}

/** Genera el PDF del reporte y lo comparte (en web abre el diálogo de impresión). */
export async function exportReportPdf(report: FinancialReport): Promise<void> {
  const html = buildReportHtml(report);

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
  await shareFile(uri, PDF_MIME, 'com.adobe.pdf');
}

/** Genera el Excel (.xlsx) del reporte y lo comparte (en web lo descarga). */
export async function exportReportExcel(report: FinancialReport): Promise<void> {
  const workbook = buildReportWorkbook(report);
  const fileName = reportFileName(report, 'xlsx');

  if (Platform.OS === 'web') {
    writeFile(workbook, fileName);
    return;
  }

  const data: ArrayBuffer = write(workbook, { type: 'array', bookType: 'xlsx' });
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(new Uint8Array(data));
  await shareFile(file.uri, XLSX_MIME, 'org.openxmlformats.spreadsheetml.sheet');
}
