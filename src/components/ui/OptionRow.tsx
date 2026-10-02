import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  label: string;
  description?: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  selected?: boolean;
  onPress?: () => void;
};

/** Fila seleccionable con icono y flecha, usada en los flujos de pago y perfil. */
export function OptionRow({ label, description, icon, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected && styles.selected]}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <Ionicons name="arrow-forward" size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  selected: {
    borderColor: colors.brand,
  },
  texts: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: colors.text,
  },
  description: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
