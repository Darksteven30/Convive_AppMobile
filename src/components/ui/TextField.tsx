import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius, spacing } from '@/constants/theme';

type Props = TextInputProps & {
  label?: string;
  /** Mensaje en línea: texto rojo debajo del campo y borde rojo (documento, sección 7.2). */
  error?: string | null;
  /** Elemento a la derecha dentro del campo, p. ej. el botón de mostrar/ocultar contraseña. */
  right?: ReactNode;
  /** Muestra «n/máximo» debajo del campo (requiere maxLength). */
  showCounter?: boolean;
};

export function TextField({
  label,
  error,
  right,
  showCounter,
  style,
  multiline,
  accessibilityLabel,
  ...rest
}: Props) {
  const counter = showCounter && rest.maxLength ? `${rest.value?.length ?? 0}/${rest.maxLength}` : null;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.box, error ? styles.boxError : null]}>
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          placeholderTextColor={colors.placeholder}
          multiline={multiline}
          style={[styles.input, multiline && styles.multiline, style]}
          {...rest}
        />
        {right}
      </View>
      {error || counter ? (
        <View style={styles.footer}>
          <Text accessibilityRole={error ? 'alert' : undefined} style={styles.error}>
            {error ?? ''}
          </Text>
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
        </View>
      ) : null}
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
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  boxError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  error: {
    flex: 1,
    fontSize: 12,
    color: colors.danger,
  },
  counter: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
