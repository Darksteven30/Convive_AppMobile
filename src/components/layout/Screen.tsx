import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { colors, layout, spacing } from '@/constants/theme';

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
      <View style={styles.column}>
        {header ? <View style={styles.header}>{header}</View> : null}
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  // En web los hijos de una columna flex pueden encogerse; el encabezado mantiene su altura.
  header: {
    flexShrink: 0,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
});
