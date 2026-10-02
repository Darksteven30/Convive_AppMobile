import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  label?: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** Control segmentado de selección única (p. ej. Ingreso / Egreso). */
export function SegmentedControl<T extends string>({ label, options, value, onChange }: Props<T>) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              onPress={() => !selected && onChange(option.value)}
              style={[styles.segment, selected && styles.selected]}
            >
              <Text style={[styles.text, selected && styles.selectedText]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 3,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  selected: {
    backgroundColor: colors.primary,
  },
  text: {
    fontSize: 14,
    color: colors.text,
  },
  selectedText: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
});
