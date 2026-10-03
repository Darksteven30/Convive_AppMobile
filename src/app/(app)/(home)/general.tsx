import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { BarChart } from '@/components/charts/BarChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { hasPermission } from '@/constants/permissions';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { bookingCategories, expenseCategories, financialSummary, pqrsCategories } from '@/data/mock';
import { formatCurrency } from '@/utils/format';

export default function GeneralScreen() {
  const { role } = useSession();

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="general" />
        </>
      }
    >
      <View style={styles.titleBlock}>
        <SectionTitle title="Resumen financiero" />
        <View style={styles.period}>
          <Text style={styles.periodText}>Este mes</Text>
          <Ionicons name="chevron-down" size={14} color={colors.text} />
        </View>
      </View>

      <BalanceCard title="Saldo actual general" amount={financialSummary.balance} />

      <View style={styles.row}>
        <Card style={styles.half}>
          <Ionicons name="arrow-up-circle" size={22} color={colors.success} />
          <Text style={styles.label}>Total ingresos</Text>
          <Text style={styles.value}>{formatCurrency(financialSummary.income)}</Text>
        </Card>
        <Card style={styles.half}>
          <Ionicons name="arrow-down-circle" size={22} color={colors.danger} />
          <Text style={styles.label}>Total egresos</Text>
          <Text style={styles.value}>{formatCurrency(financialSummary.expenses)}</Text>
        </Card>
      </View>

      <Card title="Movimiento de fondos" style={styles.chartCard}>
        <BarChart data={financialSummary.monthly} />
      </Card>

      <Card title="Categorías de gasto">
        <DonutChart data={expenseCategories} />
      </Card>

      <Card title="Categorías de PQRS">
        <DonutChart data={pqrsCategories} />
      </Card>

      <Card title="Categorías de reservas">
        <DonutChart data={bookingCategories} />
      </Card>

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
  titleBlock: {
    gap: spacing.xs,
  },
  period: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  periodText: {
    fontSize: 13,
    color: colors.text,
  },
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
  chartCard: {
    paddingBottom: spacing.xxl,
  },
});
