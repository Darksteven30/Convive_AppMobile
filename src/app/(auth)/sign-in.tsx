import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AuthScreen } from '@/components/layout/AuthScreen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing, typography } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { lookupEmail } from '@/services/auth.service';
import { EMAIL_MAX_LENGTH, isValidEmail, normalizeEmail } from '@/utils/validation';

/** RF01 · Paso 1: el usuario escribe su correo y la app decide el siguiente paso. */
export default function SignInScreen() {
  const { showDialog, showToast } = useFeedback();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = (value: string) => {
    if (!value.trim()) return MSG.RF01.emailRequired;
    if (!isValidEmail(value)) return MSG.RF01.emailInvalid;
    return null;
  };

  const handleChange = (value: string) => {
    setEmail(value);
    setTouched(true);
    // El mensaje en línea desaparece cuando el usuario corrige el dato.
    if (error && !validate(value)) setError(null);
  };

  const submit = async () => {
    const validationError = validate(email);
    setError(validationError);
    if (validationError) return;

    const normalized = normalizeEmail(email);
    setLoading(true);
    try {
      const status = await lookupEmail(normalized);
      if (status === 'registered') {
        router.push({ pathname: '/contrasena', params: { email: normalized } });
      } else if (status === 'pending') {
        router.push({ pathname: '/crear-contrasena', params: { email: normalized } });
      } else {
        showDialog({ message: MSG.RF01.emailNotRegistered, actions: [{ label: 'Aceptar', primary: true }] });
      }
    } catch {
      showToast('error', MSG.general.unexpected);
    } finally {
      setLoading(false);
    }
  };

  const socialNotAvailable = () => showToast('info', MSG.RF01.socialUnavailable);

  return (
    <AuthScreen
      title="Inicia sesión"
      subtitle={'Ingresa tu correo electrónico\npara acceder a esta aplicación'}
    >
      <TextField
        accessibilityLabel="Correo electrónico"
        placeholder="correoelectrónico@dominio.com"
        value={email}
        onChangeText={handleChange}
        onBlur={() => touched && setError(validate(email))}
        onSubmitEditing={submit}
        error={error}
        maxLength={EMAIL_MAX_LENGTH}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        returnKeyType="next"
      />
      <Button label="Continuar" onPress={submit} disabled={!isValidEmail(email)} loading={loading} block />

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>o</Text>
        <View style={styles.line} />
      </View>

      <Button
        label="Continuar con Google"
        variant="secondary"
        icon={<Ionicons name="logo-google" size={18} color="#EA4335" />}
        onPress={socialNotAvailable}
        block
      />
      <Button
        label="Continuar con Apple"
        variant="secondary"
        icon={<Ionicons name="logo-apple" size={18} color={colors.text} />}
        onPress={socialNotAvailable}
        block
      />

      <Text style={styles.terms}>
        Al hacer clic en continuar, aceptas nuestros{' '}
        <Text style={styles.termsLink}>Términos de servicio</Text> y{' '}
        <Text style={styles.termsLink}>Política de privacidad</Text>
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
  },
  terms: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textMuted,
  },
  termsLink: {
    color: colors.text,
  },
});
