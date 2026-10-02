import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = TextInputProps & {
  label?: string;
};

export function TextField({ label, style, multiline, ...rest }: Props) {
  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline, style]}
        {...rest}
      />
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 14,
    color: colors.text,
  },
  multiline: {
    minHeight: 64,
    textAlignVertical: 'top',
  },
});
