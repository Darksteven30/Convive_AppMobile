import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { PasswordRules } from '@/components/ui/PasswordRules';
import { TextField } from '@/components/ui/TextField';
import { TextLink } from '@/components/ui/TextLink';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSendResetCode } from '@/hooks/useSendResetCode';
import { AuthError, resetPassword } from '@/services/auth.service';
import { meetsPasswordRules, RESET_CODE_LENGTH } from '@/utils/validation';

/** RF01 · Recuperación: código de 6 dígitos enviado al correo (válido 10 min) y nueva contraseña. */
export default function RecuperarContrasenaScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { showToast } = useFeedback();
  const { send: resendCode, sending } = useSendResetCode(email);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const matches = password === confirmation;
  const mismatchError = confirmation.length > 0 && !matches ? MSG.RF01.passwordsDontMatch : null;
  const canSubmit = code.length === RESET_CODE_LENGTH && meetsPasswordRules(password) && matches;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await resetPassword(email, code, password);
      showToast('success', MSG.RF01.passwordUpdated);
      router.back();
    } catch (e) {
      setLoading(false);
      if (e instanceof AuthError && e.code === 'invalid_code') {
        setCodeError(MSG.RF01.resetCodeInvalid);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  return (
    <AuthScreen
      title="Recupera tu contraseña"
      subtitle={`Escribe el código de 6 dígitos que enviamos a ${email} y define una nueva contraseña.`}
      showBack
    >
      <TextField
        accessibilityLabel="Código de verificación"
        placeholder="Código de 6 dígitos"
        value={code}
        onChangeText={(value) => {
          setCode(value.replace(/\D/g, ''));
          setCodeError(null);
        }}
        error={codeError}
        maxLength={RESET_CODE_LENGTH}
        keyboardType="number-pad"
        autoComplete="one-time-code"
      />
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
      <Button label="Guardar contraseña" onPress={submit} disabled={!canSubmit} loading={loading} block />
      <TextLink label="Reenviar código" onPress={resendCode} disabled={sending} />
    </AuthScreen>
  );
}
