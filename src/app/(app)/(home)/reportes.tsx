import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { MovementRow } from '@/components/finance/MovementRow';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { SelectField } from '@/components/ui/SelectField';
import { MSG } from '@/constants/messages';
import { colors, spacing, typography } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  ALL_CATEGORIES,
  FinanceError,
  getFinancialReport,
  listReportCategories,
  validateReportFilters,
  type Category,
  type FinancialReport,
} from '@/services/finance.service';
import { categoryLabel, exportReportExcel, exportReportPdf } from '@/services/report-export.service';
import { formatDate, startOfMonthISO, todayISO } from '@/utils/date';
import { formatAmount } from '@/utils/money';

type ExportFormat = 'pdf' | 'excel';

/**
 * RF04 · Reportes financieros filtrables por fecha y categoría.
 * Administrador y junta directiva (solo lectura): no modifica ningún dato.
 */
export default function ReportesScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const today = todayISO();

  const [from, setFrom] = useState(() => startOfMonthISO(today));
  const [to, setTo] = useState(today);
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [categories, setCategories] = useState<Category[]>([]);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  useEffect(() => {
    let active = true;
    listReportCategories().then((items) => active && setCategories(items));
    return () => {
      active = false;
    };
  }, []);

  const filters = { from, to, categoryId };
  const errors = validateReportFilters(filters, today);
  const hasErrors = Object.keys(errors).length > 0;
  const hasData = !!report && report.movements.length > 0;

  const categoryOptions = [
    { value: ALL_CATEGORIES, label: 'Todas' },
    ...categories.map((category) => ({
      value: category.id,
      label: `${category.name} · ${category.type === 'ingreso' ? 'Ingreso' : 'Egreso'}${category.active ? '' : ' (inactiva)'}`,
    })),
  ];

  // Al cambiar un filtro el reporte anterior deja de corresponder: se oculta hasta volver a generarlo.
  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setReport(null);
  };

  const generate = async () => {
    if (!user || hasErrors) return;
    setLoading(true);
    try {
      setReport(await getFinancialReport(filters, user));
    } catch (e) {
      if (e instanceof FinanceError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF04.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else {
        showToast('error', MSG.general.unexpected);
      }
    } finally {
      setLoading(false);
    }
  };

  const exportAs = async (format: ExportFormat) => {
    if (!report) return;
    setExporting(format);
    try {
      await (format === 'pdf' ? exportReportPdf : exportReportExcel)(report);
      showToast('success', MSG.RF04.exported);
    } catch {
      showToast('error', MSG.RF04.exportFailed);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Screen header={<AppHeader title="Reportes" left="back" showAvatar={false} />}>
      <Text accessibilityRole="header" style={typography.subtitle}>
        Reporte financiero
      </Text>

      <Card>
        <View style={styles.dates}>
          <View style={styles.dateColumn}>
            <DateField
              label="Fecha inicial"
              value={from}
              maxDate={today}
              onChange={changeFilter(setFrom)}
              error={errors.from}
            />
          </View>
          <View style={styles.dateColumn}>
            <DateField
              label="Fecha final"
              value={to}
              maxDate={today}
              onChange={changeFilter(setTo)}
              error={errors.to}
            />
          </View>
        </View>
        <SelectField
          label="Categoría"
          options={categoryOptions}
          value={categoryId}
          onChange={changeFilter(setCategoryId)}
        />
        <Button
          label="Generar"
          variant="brand"
          block
          disabled={hasErrors}
          loading={loading}
          onPress={generate}
        />
      </Card>

      {report ? (
        <>
          <View accessibilityLabel="Totales del periodo" style={styles.totals}>
            <Total label="Total ingresos" value={report.totals.income} color={colors.toastSuccess} />
            <Total label="Total egresos" value={report.totals.expenses} color={colors.danger} />
            <Total label="Saldo del periodo" value={report.totals.balance} color={colors.text} />
          </View>

          <Text style={styles.muted}>
            {formatDate(report.filters.from)} – {formatDate(report.filters.to)} · {categoryLabel(report.filters.categoryId)} ·{' '}
            {report.movements.length} {report.movements.length === 1 ? 'movimiento' : 'movimientos'}
          </Text>

          {hasData ? (
            report.movements.map((movement) => <MovementRow key={movement.id} movement={movement} />)
          ) : (
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={48} color={colors.placeholder} />
              <Text style={styles.emptyText}>{MSG.RF04.noData}</Text>
            </View>
          )}

          <View style={styles.exports}>
            <Button
              label="Exportar PDF"
              variant="outline"
              pill
              icon={<Ionicons name="document-outline" size={16} color={colors.text} />}
              disabled={!hasData || exporting !== null}
              loading={exporting === 'pdf'}
              onPress={() => exportAs('pdf')}
              style={styles.exportButton}
            />
            <Button
              label="Exportar Excel"
              variant="outline"
              pill
              icon={<Ionicons name="grid-outline" size={16} color={colors.text} />}
              disabled={!hasData || exporting !== null}
              loading={exporting === 'excel'}
              onPress={() => exportAs('excel')}
              style={styles.exportButton}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function Total({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.total}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.totalValue, { color }]}>{formatAmount(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dates: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateColumn: {
    flex: 1,
  },
  totals: {
    gap: spacing.sm,
  },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  exports: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exportButton: {
    flex: 1,
  },
});
