import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { formatAmount } from '@/utils/money';

type Group = { label: string; income: number; expenses: number };

type Series = 'income' | 'expenses';

const SERIES: { key: Series; label: string; color: string }[] = [
  { key: 'income', label: 'Ingresos', color: colors.success },
  { key: 'expenses', label: 'Egresos', color: colors.danger },
];

type Props = {
  data: Group[];
  height?: number;
};

/**
 * Barras agrupadas de ingresos vs. egresos por mes. RF14: al tocar una barra se muestra su valor
 * exacto encima de la gráfica; al tocarla otra vez se oculta.
 */
export function BarChart({ data, height = 160 }: Props) {
  const max = Math.max(...data.flatMap((d) => [d.income, d.expenses]), 1);
  const [selected, setSelected] = useState<{ label: string; series: Series } | null>(null);

  const selectedGroup = selected ? data.find((group) => group.label === selected.label) : undefined;
  const selectedSeries = selected ? SERIES.find((series) => series.key === selected.series) : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        {SERIES.map((series) => (
          <LegendItem key={series.key} color={series.color} label={series.label} />
        ))}
      </View>
      <Text style={styles.detail} accessibilityLiveRegion="polite">
        {selectedGroup && selectedSeries
          ? `${selectedGroup.label} · ${selectedSeries.label}: ${formatAmount(selectedGroup[selectedSeries.key])}`
          : 'Toca una barra para ver su valor.'}
      </Text>
      <View style={[styles.chart, { height }]}>
        {data.map((group) => (
          <View key={group.label} style={styles.group}>
            <View style={styles.bars}>
              {SERIES.map((series) => {
                const isSelected = selected?.label === group.label && selected.series === series.key;
                return (
                  <Pressable
                    key={series.key}
                    accessibilityRole="button"
                    accessibilityLabel={`${series.label} de ${group.label}: ${formatAmount(group[series.key])}`}
                    accessibilityState={{ selected: isSelected }}
                    hitSlop={{ top: 8, bottom: 8 }}
                    onPress={() => setSelected(isSelected ? null : { label: group.label, series: series.key })}
                    style={[
                      styles.bar,
                      {
                        height: (group[series.key] / max) * height,
                        backgroundColor: series.color,
                        opacity: selected && !isSelected ? 0.4 : 1,
                      },
                    ]}
                  />
                );
              })}
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
  detail: {
    fontSize: 13,
    textAlign: 'center',
    color: colors.text,
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
    // Un valor de 0 sigue siendo tocable.
    minHeight: 2,
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
