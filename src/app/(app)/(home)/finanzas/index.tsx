import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { findCategory, listMovements, type Movement } from '@/services/finance.service';
import { formatDate } from '@/utils/date';
import { formatAmount } from '@/utils/money';

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

function MovementRow({ movement }: { movement: Movement }) {
  const isIncome = movement.type === 'ingreso';
  return (
    <View style={styles.row}>
      <Ionicons
        name={isIncome ? 'arrow-up-circle' : 'arrow-down-circle'}
        size={24}
        color={isIncome ? colors.toastSuccess : colors.danger}
      />
      <View style={styles.info}>
        <Text style={styles.description} numberOfLines={2}>
          {movement.description}
        </Text>
        <Text style={styles.muted}>
          {formatDate(movement.date)} · {findCategory(movement.categoryId)?.name ?? 'Sin categoría'}
          {movement.attachment ? ' · Con soporte' : ''}
        </Text>
      </View>
      <Text style={[styles.amount, { color: isIncome ? colors.toastSuccess : colors.danger }]}>
        {isIncome ? '+' : '−'}
        {formatAmount(movement.amount)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  description: {
    fontSize: 14,
    color: colors.text,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  amount: {
    fontSize: 14,
    fontWeight: '600',
  },
});
