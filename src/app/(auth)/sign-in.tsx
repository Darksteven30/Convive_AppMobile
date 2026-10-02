import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing, typography } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { AuthError } from '@/services/auth.service';

export default function SignInScreen() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Al iniciar sesión no se navega a mano: los guards de _layout.tsx redirigen según el rol.
  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'No se pudo iniciar sesión. Intenta de nuevo.');
      setLoading(false);
    }
  };

  const socialNotAvailable = () =>
    Alert.alert('Próximamente', 'El inicio de sesión con redes sociales estará disponible pronto.');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <BrandLogo size={80} />
          <Text style={styles.appName}>Convive</Text>
        </View>

        <View style={styles.intro}>
          <Text style={typography.subtitle}>Inicia sesión</Text>
          <Text style={styles.centerText}>
            Ingresa tu correo electrónico y contraseña{'\n'}para acceder a esta aplicación
          </Text>
        </View>

        <TextField
          placeholder="correoelectrónico@dominio.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <TextField
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={loading ? 'Ingresando…' : 'Continuar'} onPress={submit} disabled={loading} block />

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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.lg,
  },
  brand: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  appName: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  intro: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  centerText: {
    ...typography.body,
    textAlign: 'center',
    color: colors.text,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
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
