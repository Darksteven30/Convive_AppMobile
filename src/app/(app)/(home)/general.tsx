import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { SelectField } from '@/components/ui/SelectField';
import { MSG } from '@/constants/messages';
import { hasPermission } from '@/constants/permissions';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import type { Category } from '@/data/mock';
import { PQRS_STATUS_LABELS, pqrsTypeLabel } from '@/services/pqrs.types';
import {
  SUMMARY_PERIODS,
  getSummary,
  rangeForPeriod,
  validateSummaryRange,
  type FinancialSummary,
  type SummaryPeriod,
  type SummaryRange,
} from '@/services/summary.service';
import { formatShortMonth, todayISO } from '@/utils/date';
import { formatAmount } from '@/utils/money';

/** Colores de las donas, en orden: el segmento más grande toma el primero. */
const CHART_COLORS = ['#1E3A8A', '#38BDF8', '#16A34A', '#DC2626', '#F97316', '#7C3AED', '#0F766E', '#CA8A04'];

const withColors = (items: { label: string; value: number }[]): Category[] =>
  items.map((item, index) => ({ ...item, color: CHART_COLORS[index % CHART_COLORS.length] }));

/** RF14 · Resumen financiero del conjunto (solo lectura para la junta y el residente). */
export default function GeneralScreen() {
  const { role, user } = useSession();
  const today = todayISO();
  const [period, setPeriod] = useState<SummaryPeriod>('este_mes');
  const [custom, setCustom] = useState<SummaryRange>(() => rangeForPeriod('este_mes', today));
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [failed, setFailed] = useState(false);

  // «Personalizado» usa las fechas elegidas; si no son válidas no se consulta (MSG-RF14-02).
  const range = period === 'personalizado' ? custom : rangeForPeriod(period, today);
  const rangeErrors = period === 'personalizado' ? validateSummaryRange(custom, today) : {};
  const rangeValid = Object.keys(rangeErrors).length === 0;

  const load = useCallback(() => {
    if (!user || !rangeValid) return;
    let active = true;
    setFailed(false);
    setSummary(null);
    getSummary(range, user)
      .then((result) => active && setSummary(result))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // El rango se reconstruye en cada render: se depende de sus fechas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, range.from, range.to, rangeValid]);

  // Se recarga al volver a General (p. ej. después de cambiar el saldo inicial en Finanzas).
  useFocusEffect(load);

  const hasMovements = summary !== null && (summary.income > 0 || summary.expenses > 0);

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="general" />
        </>
      }
    >
      <SectionTitle title="Resumen financiero" />

      <SelectField
        label="Periodo"
        options={SUMMARY_PERIODS}
        value={period}
        onChange={(value) => setPeriod(value as SummaryPeriod)}
      />
      {period === 'personalizado' && (
        <View style={styles.row}>
          <View style={styles.half}>
            <DateField
              label="Fecha inicial"
              value={custom.from}
              maxDate={today}
              onChange={(from) => setCustom((current) => ({ ...current, from }))}
              error={rangeErrors.from}
            />
          </View>
          <View style={styles.half}>
            <DateField
              label="Fecha final"
              value={custom.to}
              maxDate={today}
              onChange={(to) => setCustom((current) => ({ ...current, to }))}
              error={rangeErrors.to}
            />
          </View>
        </View>
      )}

      {!rangeValid ? null : failed ? (
        // MSG-RF14-03
        <Card>
          <Text style={styles.muted}>{MSG.RF14.loadFailed}</Text>
          <Button label="Reintentar" variant="outline" pill onPress={load} />
        </Card>
      ) : summary === null ? (
        <ActivityIndicator color={colors.brandDark} accessibilityLabel="Cargando el resumen financiero" />
      ) : (
        <>
          {/* El saldo es a la fecha de hoy: no depende del periodo. */}
          <BalanceCard title="Saldo actual general" amount={summary.balance} />

          <View style={styles.row}>
            <Card style={styles.half}>
              <Ionicons name="arrow-up-circle" size={22} color={colors.success} />
              <Text style={styles.label}>Total ingresos</Text>
              <Text style={styles.value}>{formatAmount(summary.income)}</Text>
            </Card>
            <Card style={styles.half}>
              <Ionicons name="arrow-down-circle" size={22} color={colors.danger} />
              <Text style={styles.label}>Total egresos</Text>
              <Text style={styles.value}>{formatAmount(summary.expenses)}</Text>
            </Card>
          </View>

          <Card title="Movimiento de fondos" style={hasMovements ? styles.chartCard : undefined}>
            {hasMovements ? (
              <BarChart
                data={summary.monthly.map((m) => ({
                  label: formatShortMonth(m.month),
                  income: m.income,
                  expenses: m.expenses,
                }))}
              />
            ) : (
              <Text style={styles.muted}>{MSG.RF14.noMovements}</Text>
            )}
          </Card>

          <Card title="Categorías de gasto">
            {summary.expenseCategories.length > 0 ? (
              <DonutChart data={withColors(summary.expenseCategories.map((c) => ({ label: c.name, value: c.total })))} />
            ) : (
              <Text style={styles.muted}>{MSG.RF14.noMovements}</Text>
            )}
          </Card>

          <Card title="Categorías de PQRS">
            {summary.pqrsByType.length > 0 ? (
              <>
                <DonutChart
                  data={withColors(summary.pqrsByType.map((p) => ({ label: pqrsTypeLabel(p.type), value: p.count })))}
                />
                <Text style={styles.muted}>
                  {summary.pqrsByStatus.map((s) => `${PQRS_STATUS_LABELS[s.status]}: ${s.count}`).join(' · ')}
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>{MSG.RF14.noPqrs}</Text>
            )}
          </Card>

          <Card title="Categorías de reservas">
            {summary.reservationsByZone.length > 0 ? (
              <DonutChart data={withColors(summary.reservationsByZone.map((r) => ({ label: r.zone, value: r.count })))} />
            ) : (
              <Text style={styles.muted}>{MSG.RF14.noReservations}</Text>
            )}
          </Card>
        </>
      )}

      {/* RF04: la junta directiva consulta los reportes desde aquí (no tiene Panel). */}
      {hasPermission(role, 'reportes') && (
        <Button
          label="Ver reportes financieros"
          variant="outline"
          pill
          icon={<Ionicons name="document-text-outline" size={16} color={colors.text} />}
          onPress={() => router.push('/reportes')}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    color: colors.text,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  chartCard: {
    paddingBottom: spacing.xxl,
  },
});
