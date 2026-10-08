import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/constants/theme';
import { WOMPI_METHOD_LABELS, type PaymentResult, type WompiMethod } from '@/services/payments.service';
import { formatDateTime, formatMonthYear } from '@/utils/date';
import { formatAmount } from '@/utils/money';

type Props = {
  payment: PaymentResult;
  selected: boolean;
  onPress: () => void;
};

/** «Ago 2026 — Cuota administración»; en «Otros conceptos» agrega la descripción. */
export function historyLabel(payment: PaymentResult): string {
  const concept = payment.description ? `${payment.conceptName} (${payment.description})` : payment.conceptName;
  return `${formatMonthYear(new Date(payment.date))} — ${concept}`;
}

/** Fila del historial de pagos (RF02): se marca con un check para descargar su comprobante. */
export function PaymentHistoryRow({ payment, selected, onPress }: Props) {
  const label = historyLabel(payment);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}, ${formatAmount(payment.amount)}`}
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={22}
        color={selected ? colors.brandDark : colors.textMuted}
      />
      <View style={styles.info}>
        <Text style={styles.label} numberOfLines={2}>
          {label}
        </Text>
        <Text style={styles.muted}>
          {formatDateTime(new Date(payment.date))}
          {payment.method ? ` · ${WOMPI_METHOD_LABELS[payment.method as WompiMethod] ?? payment.method}` : ''}
        </Text>
      </View>
      <Text style={styles.amount}>{formatAmount(payment.amount)}</Text>
    </Pressable>
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
  rowSelected: {
    borderColor: colors.brandDark,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  label: {
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
    color: colors.text,
  },
});
