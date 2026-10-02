import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { PasswordRules } from '@/components/ui/PasswordRules';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { TextField } from '@/components/ui/TextField';
import { spacing } from '@/constants/theme';
import { meetsPasswordRules } from '@/utils/validation';

export default function CambiarContrasenaScreen() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const meetsRules = meetsPasswordRules(password);
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

      <PasswordRules
        password={password}
        error={confirmation.length > 0 && !matches ? 'Las contraseñas no coinciden' : null}
      />
    </Screen>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.field}>
      <SectionTitle title={label} />
      <TextField
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
});
