import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/PasswordField';
import { TextLink } from '@/components/ui/TextLink';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { useSendResetCode } from '@/hooks/useSendResetCode';
import { AuthError } from '@/services/auth.service';
import { PASSWORD_MIN_LENGTH } from '@/utils/validation';

/**
 * RF01 · Paso 2: contraseña de una cuenta registrada.
 * Al iniciar sesión no se navega a mano: los guards de _layout.tsx llevan a la pantalla del rol.
 */
export default function ContrasenaScreen() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { signIn } = useSession();
  const { showDialog, showToast } = useFeedback();
  const { send: sendResetCode, sending } = useSendResetCode(email);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const goToRecovery = async () => {
    if (await sendResetCode()) {
      router.push({ pathname: '/recuperar-contrasena', params: { email } });
    }
  };

  const submit = async () => {
    if (password.length < PASSWORD_MIN_LENGTH) return;
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setLoading(false);
      if (e instanceof AuthError && e.code === 'invalid_credentials') {
        setError(MSG.RF01.wrongPassword(e.remainingAttempts ?? 0));
      } else if (e instanceof AuthError && e.code === 'locked') {
        setPassword('');
        showDialog({
          message: MSG.RF01.accountLocked,
          actions: [
            { label: 'Recuperar contraseña', primary: true, onPress: goToRecovery },
            { label: 'Aceptar' },
          ],
        });
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  return (
    <AuthScreen title="Ingresa tu contraseña" subtitle={email} showBack>
      <PasswordField
        accessibilityLabel="Contraseña"
        placeholder="Contraseña"
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setError(null);
        }}
        onSubmitEditing={submit}
        error={error}
        autoComplete="password"
        autoFocus
      />
      <Button
        label="Iniciar sesión"
        onPress={submit}
        disabled={password.length < PASSWORD_MIN_LENGTH}
        loading={loading}
        block
      />
      <TextLink label="¿Olvidaste tu contraseña?" onPress={goToRecovery} disabled={sending} />
    </AuthScreen>
  );
}
