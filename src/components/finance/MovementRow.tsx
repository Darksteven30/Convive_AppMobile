import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/constants/theme';
import { findCategory, type Movement } from '@/services/finance.service';
import { formatDate } from '@/utils/date';
import { formatAmount } from '@/utils/money';

/** Fila de un ingreso o egreso: concepto, fecha, categoría y valor con su signo (RF03 y RF04). */
export function MovementRow({ movement }: { movement: Movement }) {
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
