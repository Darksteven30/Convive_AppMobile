import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { PasswordRules } from '@/components/ui/PasswordRules';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { meetsPasswordRules } from '@/utils/validation';

/** RF01 · Cuenta pre-registrada por la administración: el usuario crea su primera contraseña. */
export default function CrearContrasenaScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { createPassword } = useSession();
  const { showToast } = useFeedback();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const matches = password === confirmation;
  const mismatchError = confirmation.length > 0 && !matches ? MSG.RF01.passwordsDontMatch : null;
  const canSubmit = meetsPasswordRules(password) && matches;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await createPassword(email, password);
    } catch {
      setLoading(false);
      showToast('error', MSG.general.unexpected);
    }
  };

  return (
    <AuthScreen
      title="Crea tu contraseña"
      subtitle={`Es la primera vez que ingresas con ${email}.`}
      showBack
    >
      <PasswordField
        accessibilityLabel="Nueva contraseña"
        placeholder="Nueva contraseña"
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
      />
      <PasswordField
        accessibilityLabel="Confirmar contraseña"
        placeholder="Confirmar contraseña"
        value={confirmation}
        onChangeText={setConfirmation}
        onSubmitEditing={submit}
        error={mismatchError}
        autoComplete="new-password"
      />
      <PasswordRules password={password} />
      <Button label="Crear contraseña" onPress={submit} disabled={!canSubmit} loading={loading} block />
    </AuthScreen>
  );
}
