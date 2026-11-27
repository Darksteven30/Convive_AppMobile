import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { colors, spacing } from '@/constants/theme';
import type { Category } from '@/data/mock';

type Props = {
  data: Category[];
  size?: number;
  strokeWidth?: number;
  /** Cómo se muestra un valor al tocar un segmento (p. ej. dinero o cantidad). */
  formatValue?: (value: number) => string;
  /** Texto del total en el centro de la dona (RF14). */
  centerLabel?: string;
};

const percentOf = (value: number, total: number) => Math.round((value / total) * 100);

/**
 * Gráfico de dona con leyenda de porcentajes por categoría y el total en el centro. RF14: al tocar
 * un segmento o su fila de la leyenda se muestra la categoría, el valor y el porcentaje.
 */
export function DonutChart({ data, size = 140, strokeWidth = 22, formatValue = String, centerLabel }: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
  const [selected, setSelected] = useState<string | null>(null);

  // Cada segmento empieza donde termina el anterior (sin variables mutables durante el render).
  const segments = data.reduce<(Category & { length: number; offset: number })[]>((acc, item) => {
    const previous = acc[acc.length - 1];
    const offset = previous ? previous.offset + previous.length : 0;
    return [...acc, { ...item, length: (item.value / total) * circumference, offset }];
  }, []);

  const toggle = (label: string) => setSelected((current) => (current === label ? null : label));
  const selectedItem = data.find((item) => item.label === selected);

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {/* Rota -90° para que el primer segmento empiece arriba. Se usa el transform SVG estándar
                porque las props rotation/origin generan un atributo inválido en la web. */}
            <G transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              {segments.map((segment) => (
                <Circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={selected === segment.label ? strokeWidth + 4 : strokeWidth}
                  strokeOpacity={selected && selected !== segment.label ? 0.4 : 1}
                  strokeDasharray={`${segment.length} ${circumference - segment.length}`}
                  strokeDashoffset={-segment.offset}
                  fill="none"
                  onPress={() => toggle(segment.label)}
                />
              ))}
            </G>
          </Svg>
          {centerLabel ? (
            <View pointerEvents="none" style={styles.center}>
              <Text style={styles.centerLabel}>{centerLabel}</Text>
              <Text style={styles.centerCaption}>Total</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.legend}>
          {data.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}: ${formatValue(item.value)}, ${percentOf(item.value, total)} %`}
              accessibilityState={{ selected: selected === item.label }}
              onPress={() => toggle(item.label)}
              style={styles.legendItem}
            >
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={[styles.legendLabel, selected === item.label && styles.legendSelected]}>
                {item.label} · {percentOf(item.value, total)} %
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={styles.detail} accessibilityLiveRegion="polite">
        {selectedItem
          ? `${selectedItem.label}: ${formatValue(selectedItem.value)} · ${percentOf(selectedItem.value, total)} %`
          : 'Toca un segmento para ver su valor.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  centerCaption: {
    fontSize: 11,
    color: colors.textMuted,
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
  legendSelected: {
    fontWeight: '700',
  },
  detail: {
    fontSize: 13,
    color: colors.text,
  },
});
