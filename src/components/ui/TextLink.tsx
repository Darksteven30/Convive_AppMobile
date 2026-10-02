import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

/** Enlace de texto, p. ej. «¿Olvidaste tu contraseña?». */
export function TextLink({ label, onPress, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={styles.link}
    >
      <Text style={[styles.label, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
  disabled: {
    opacity: 0.5,
  },
});
