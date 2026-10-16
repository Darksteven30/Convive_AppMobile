import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { PasswordRules } from '@/components/ui/PasswordRules';
import { TextField } from '@/components/ui/TextField';
import { TextLink } from '@/components/ui/TextLink';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { useSendEmailCode } from '@/hooks/useSendEmailCode';
import { AuthError, requestAccountCode } from '@/services/auth.service';
import { meetsPasswordRules, RESET_CODE_LENGTH } from '@/utils/validation';

/**
 * RF01 · Cuenta pre-registrada por la administración: el usuario crea su primera contraseña.
 * El código de 6 dígitos que llega al correo comprueba que la cuenta es suya.
 */
export default function CrearContrasenaScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { createPassword } = useSession();
  const { showToast } = useFeedback();
  const { send: resendCode, sending } = useSendEmailCode(email, requestAccountCode);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);

  const matches = password === confirmation;
  const mismatchError = confirmation.length > 0 && !matches ? MSG.RF01.passwordsDontMatch : null;
  const canSubmit = code.length === RESET_CODE_LENGTH && meetsPasswordRules(password) && matches;

  const submit = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    try {
      await createPassword(email, code, password);
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
      title="Crea tu contraseña"
      subtitle={`Es la primera vez que ingresas con ${email}. Escribe el código de 6 dígitos que te enviamos y crea tu contraseña.`}
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
      <Button label="Crear contraseña" onPress={submit} disabled={!canSubmit} loading={loading} block />
      <TextLink label="Reenviar código" onPress={resendCode} disabled={sending} />
    </AuthScreen>
  );
}
