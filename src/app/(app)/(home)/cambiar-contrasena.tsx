import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';

const rules = [
  { label: 'Mínimo 8 caracteres', test: (value: string) => value.length >= 8 },
  { label: 'Una mayúscula', test: (value: string) => /[A-ZÁÉÍÓÚÑ]/.test(value) },
  { label: 'Un número o símbolo', test: (value: string) => /[\d\W_]/.test(value) },
];

export default function CambiarContrasenaScreen() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const meetsRules = rules.every((rule) => rule.test(password));
  const matches = password.length > 0 && password === confirmation;
  const canSave = current.length > 0 && meetsRules && matches;

  const save = () => {
    Alert.alert('Contraseña actualizada', 'Tu contraseña se cambió correctamente.');
    router.back();
  };

  return (
    <Screen
      header={<AppHeader title="Cambiar contraseña" left="back" showAvatar={false} />}
      footer={<Button label="Guardar cambios" variant="success" pill block disabled={!canSave} onPress={save} />}
    >
      <Field label="Contraseña actual" value={current} onChange={setCurrent} />
      <Field label="Nueva contraseña" value={password} onChange={setPassword} />
      <Field label="Confirmar nueva contraseña" value={confirmation} onChange={setConfirmation} />

      <View style={styles.rules}>
        {rules.map((rule) => {
          const ok = rule.test(password);
          return (
            <Text key={rule.label} style={[styles.rule, ok && styles.ruleOk]}>
              {ok ? '✓' : '○'} {rule.label}
            </Text>
          );
        })}
        {confirmation.length > 0 && !matches ? (
          <Text style={[styles.rule, styles.ruleError]}>Las contraseñas no coinciden</Text>
        ) : null}
      </View>
    </Screen>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <SectionTitle title={label} />
      <TextField value={value} onChangeText={onChange} secureTextEntry autoCapitalize="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
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
    color: colors.brandDark,
  },
  ruleError: {
    color: colors.danger,
  },
});
