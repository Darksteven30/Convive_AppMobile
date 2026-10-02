import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: 13,
    color: colors.text,
  },
  selectedLabel: {
    color: colors.onPrimary,
    fontWeight: '500',
  },
});
