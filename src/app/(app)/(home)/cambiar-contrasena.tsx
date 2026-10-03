import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { PasswordRules } from '@/components/ui/PasswordRules';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { MSG } from '@/constants/messages';
import { spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { AuthError } from '@/services/auth.service';
import { meetsPasswordRules } from '@/utils/validation';

/** RF17 · Cambio de contraseña: verifica la actual en el servicio y exige una nueva distinta y segura. */
export default function CambiarContrasenaScreen() {
  const { changePassword } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const meetsRules = meetsPasswordRules(password);
  const sameAsCurrent = password.length > 0 && password === current;
  const matches = password === confirmation;
  const canSave = current.length > 0 && meetsRules && !sameAsCurrent && matches;
  const dirty = current.length > 0 || password.length > 0 || confirmation.length > 0;

  // Mensajes en línea del documento (MSG-RF17-03, 04 y 05).
  const passwordError = sameAsCurrent
    ? MSG.RF17.sameAsCurrent
    : passwordTouched && password.length > 0 && !meetsRules
      ? MSG.RF17.weak
      : null;
  const confirmationError = confirmation.length > 0 && !matches ? MSG.RF17.mismatch : null;

  const changeCurrent = (value: string) => {
    setCurrent(value);
    setCurrentError(null);
  };

  // MSG-RF17-06: con datos escritos, la flecha ← pide confirmación antes de salir.
  const goBack = () => {
    if (!dirty) {
      router.back();
      return;
    }
    showDialog({
      title: MSG.RF17.leaveTitle,
      message: MSG.RF17.leaveMessage,
      actions: [
        { label: 'Salir', primary: true, onPress: () => router.back() },
        { label: 'Seguir editando' },
      ],
    });
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await changePassword(current, password);
      showToast('success', MSG.RF17.updated);
      router.back();
    } catch (e) {
      setSaving(false);
      if (e instanceof AuthError && e.code === 'wrong_password') {
        setCurrentError(MSG.RF17.wrongCurrent);
      } else if (e instanceof AuthError && (e.code === 'same_password' || e.code === 'weak_password')) {
        setPasswordTouched(true);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  return (
    <Screen
      header={<AppHeader title="Cambiar contraseña" left="back" showAvatar={false} onBack={goBack} />}
      footer={
        <Button
          label="Guardar cambios"
          variant="success"
          pill
          block
          disabled={!canSave}
          loading={saving}
          onPress={save}
        />
      }
    >
      <View style={styles.field}>
        <SectionTitle title="Contraseña actual" />
        <PasswordField
          accessibilityLabel="Contraseña actual"
          value={current}
          onChangeText={changeCurrent}
          error={currentError}
          autoComplete="current-password"
        />
      </View>
      <View style={styles.field}>
        <SectionTitle title="Nueva contraseña" />
        <PasswordField
          accessibilityLabel="Nueva contraseña"
          value={password}
          onChangeText={setPassword}
          onBlur={() => setPasswordTouched(true)}
          error={passwordError}
          autoComplete="new-password"
        />
      </View>
      <View style={styles.field}>
        <SectionTitle title="Confirmar nueva contraseña" />
        <PasswordField
          accessibilityLabel="Confirmar nueva contraseña"
          value={confirmation}
          onChangeText={setConfirmation}
          onSubmitEditing={save}
          error={confirmationError}
          autoComplete="new-password"
        />
      </View>

      <PasswordRules password={password} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.sm,
  },
});
