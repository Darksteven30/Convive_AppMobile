import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing, typography } from '@/constants/theme';
import { adminSummary } from '@/data/mock';
import { formatCurrency } from '@/utils/format';

/**
 * Pantalla principal del administrador (RF01): indicadores de cartera y PQRS pendientes.
 * Las acciones de administración (RF03, RF04, RF08) se agregarán cuando tengan mockup.
 */
export default function PanelScreen() {
  const { portfolioDue, unitsInArrears, totalUnits, pendingPqrs } = adminSummary;

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="panel" />
        </>
      }
    >
      <Text accessibilityRole="header" style={typography.title}>
        Panel de administración
      </Text>

      <Card title="Cartera por cobrar">
        <Text style={typography.amount}>{formatCurrency(portfolioDue)}</Text>
        <Text style={styles.muted}>
          {unitsInArrears} de {totalUnits} unidades en mora
        </Text>
      </Card>

      <Card title="PQRS pendientes">
        <View style={styles.row}>
          <Text style={styles.count}>{pendingPqrs}</Text>
          <Text style={styles.muted}>solicitudes sin responder</Text>
        </View>
        <Button label="Ver PQRS" variant="outline" pill onPress={() => router.push('/pqrs')} />
      </Card>

      <Button label="Ver resumen financiero" variant="outline" pill onPress={() => router.replace('/general')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  count: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
  },
});
