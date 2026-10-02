import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/layout/BrandLogo';
import { colors, layout, spacing, typography } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Muestra la flecha para volver a la pantalla anterior. */
  showBack?: boolean;
  children: ReactNode;
};

/** Contenedor de las pantallas de inicio de sesión: logo, título y formulario centrado. */
export function AuthScreen({ title, subtitle, showBack, children }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.container}>
            {showBack ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Volver"
                onPress={() => router.back()}
                hitSlop={8}
                style={styles.back}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </Pressable>
            ) : null}

            <View style={styles.brand}>
              <BrandLogo size={showBack ? 64 : 80} />
              <Text style={styles.appName}>Convive</Text>
            </View>

            <View style={styles.intro}>
              <Text accessibilityRole="header" style={typography.subtitle}>
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },
  container: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  back: {
    alignSelf: 'flex-start',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
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
  subtitle: {
    ...typography.body,
    textAlign: 'center',
    color: colors.text,
  },
});
