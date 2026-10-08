import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius, spacing } from '@/constants/theme';

type Variant = 'primary' | 'success' | 'brand' | 'wompi' | 'secondary' | 'outline';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ReactNode;
  disabled?: boolean;
  /** Esperando al servidor: muestra «Procesando…» con indicador y evita dobles envíos. */
  loading?: boolean;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
  /** Bordes completamente redondeados. */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
};

const variantStyles: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  success: { bg: colors.success, fg: colors.text },
  brand: { bg: colors.brandDark, fg: colors.onPrimary },
  wompi: { bg: colors.wompi, fg: colors.onPrimary },
  secondary: { bg: colors.surface, fg: colors.text },
  outline: { bg: colors.background, fg: colors.text, border: colors.border },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  block,
  pill,
  style,
}: Props) {
  const v = variantStyles[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border ?? v.bg,
          borderRadius: pill ? radius.pill : radius.md,
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: disabled && !loading ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon}
      <Text style={[styles.label, { color: v.fg }]}>{loading ? 'Procesando…' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
});
