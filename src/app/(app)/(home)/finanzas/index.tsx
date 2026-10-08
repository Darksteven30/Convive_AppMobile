import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import { MovementRow } from '@/components/finance/MovementRow';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { colors, spacing, typography } from '@/constants/theme';
import { listMovements, type Movement } from '@/services/finance.service';

/** Finanzas (administrador): movimientos registrados y acceso a «Nuevo movimiento» (RF03). */
export default function FinanzasScreen() {
  const [movements, setMovements] = useState<Movement[] | null>(null);

  // Se recarga cada vez que la pantalla vuelve a tener el foco (p. ej. al guardar un movimiento).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listMovements().then((items) => active && setMovements(items));
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen
      header={<AppHeader title="Finanzas" left="back" showAvatar={false} />}
      footer={
        <Button
          label="Nuevo movimiento"
          variant="success"
          pill
          block
          icon={<Ionicons name="add" size={18} color={colors.text} />}
          onPress={() => router.push('/finanzas/nuevo')}
        />
      }
    >
      <Text accessibilityRole="header" style={typography.subtitle}>
        Movimientos registrados
      </Text>

      {movements === null ? (
        <ActivityIndicator color={colors.brandDark} />
      ) : movements.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="wallet-outline" size={48} color={colors.placeholder} />
          <Text style={styles.muted}>Aún no hay movimientos registrados.</Text>
        </View>
      ) : (
        movements.map((movement) => <MovementRow key={movement.id} movement={movement} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
