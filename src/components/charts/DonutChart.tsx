import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors, spacing } from '@/constants/theme';
import type { Category } from '@/data/mock';

type Props = {
  data: Category[];
  size?: number;
  strokeWidth?: number;
};

/** Gráfico de dona con leyenda de porcentajes por categoría. */
export function DonutChart({ data, size = 140, strokeWidth = 22 }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;

  let offset = 0;
  const segments = data.map((item) => {
    const length = (item.value / total) * circumference;
    const segment = { ...item, length, offset };
    offset += length;
    return segment;
  });

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          {segments.map((segment) => (
            <Circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${segment.length} ${circumference - segment.length}`}
              strokeDashoffset={-segment.offset}
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.legend}>
        {data.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>
              {item.label} · {Math.round((item.value / total) * 100)} %
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  legend: {
    flex: 1,
    gap: spacing.xs + 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: colors.text,
  },
});
