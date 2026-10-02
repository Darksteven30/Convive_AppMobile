import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { passwordRules } from '@/utils/validation';

type Props = {
  password: string;
  /** Mensaje adicional en rojo, p. ej. «Las contraseñas no coinciden». */
  error?: string | null;
};

/** Lista de requisitos de contraseña: cada uno pasa de ○ gris a ✓ verde al cumplirse. */
export function PasswordRules({ password, error }: Props) {
  return (
    <View style={styles.rules}>
      {passwordRules.map((rule) => {
        const ok = rule.test(password);
        return (
          <Text key={rule.label} style={[styles.rule, ok && styles.ruleOk]}>
            {ok ? '✓' : '○'} {rule.label}
          </Text>
        );
      })}
      {error ? <Text style={[styles.rule, styles.ruleError]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rules: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rule: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  ruleOk: {
    color: colors.toastSuccess,
  },
  ruleError: {
    color: colors.danger,
  },
});
