import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { colors, spacing } from '@/constants/theme';

type Props = {
  header?: ReactNode;
  /** Contenido fijo debajo del área desplazable (p. ej. botón "Continuar"). */
  footer?: ReactNode;
  children: ReactNode;
};

/** Contenedor base de cada pantalla: área segura, encabezado y contenido desplazable. */
export function Screen({ header, footer, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
