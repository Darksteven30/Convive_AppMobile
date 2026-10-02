import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type Group = { label: string; income: number; expenses: number };

type Props = {
  data: Group[];
  height?: number;
};

/** Barras agrupadas de ingresos vs. egresos por mes. */
export function BarChart({ data, height = 160 }: Props) {
  const max = Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1);

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <LegendItem color={colors.success} label="Ingresos" />
        <LegendItem color={colors.danger} label="Egresos" />
      </View>
      <View style={[styles.chart, { height }]}>
        {data.map((group) => (
          <View key={group.label} style={styles.group}>
            <View style={styles.bars}>
              <View
                style={[styles.bar, { height: (group.income / max) * height, backgroundColor: colors.success }]}
              />
              <View
                style={[styles.bar, { height: (group.expenses / max) * height, backgroundColor: colors.danger }]}
              />
            </View>
            <Text style={styles.axisLabel}>{group.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  group: {
    alignItems: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  bar: {
    width: 28,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  axisLabel: {
    position: 'absolute',
    bottom: -20,
    fontSize: 12,
    color: colors.textMuted,
  },
});
