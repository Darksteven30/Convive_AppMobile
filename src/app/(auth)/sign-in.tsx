import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { colors, spacing, typography } from '@/constants/theme';

export default function SignInScreen() {
  const [email, setEmail] = useState('');

  const enterApp = () => router.replace('/inicio');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.brand}>
          <BrandLogo size={80} />
          <Text style={styles.appName}>Convive</Text>
        </View>

        <View style={styles.intro}>
          <Text style={typography.subtitle}>Crea una cuenta</Text>
          <Text style={styles.centerText}>
            Ingresa tu correo electrónico{'\n'}para registrarte en esta aplicación
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
        <Button label="Continuar" onPress={enterApp} block />

        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.line} />
        </View>

        <Button
          label="Continuar con Google"
          variant="secondary"
          icon={<Ionicons name="logo-google" size={18} color="#EA4335" />}
          onPress={enterApp}
          block
        />
        <Button
          label="Continuar con Apple"
          variant="secondary"
          icon={<Ionicons name="logo-apple" size={18} color={colors.text} />}
          onPress={enterApp}
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
