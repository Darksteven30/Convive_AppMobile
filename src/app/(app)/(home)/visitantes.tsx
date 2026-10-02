import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Card } from '@/components/ui/Card';
import { colors, spacing, typography } from '@/constants/theme';
import { expectedVisitors } from '@/data/mock';

/**
 * Pantalla principal de vigilancia (RF01): visitantes esperados hoy.
 * El registro de entradas y salidas se implementa en RF10.
 */
export default function VisitantesScreen() {
  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="visitantes" />
        </>
      }
    >
      <Text accessibilityRole="header" style={typography.title}>
        Visitantes esperados hoy
      </Text>

      {expectedVisitors.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.placeholder} />
          <Text style={styles.emptyText}>No hay visitantes esperados para hoy.</Text>
        </View>
      ) : (
        expectedVisitors.map((visitor) => (
          <Card key={visitor.id} title={visitor.name}>
            <Text style={styles.muted}>
              {visitor.unit} · {visitor.time}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
