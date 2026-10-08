import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { colors, typography } from '@/constants/theme';
import { formatAmount } from '@/utils/money';

type Props = {
  title?: string;
  /** Saldo en pesos; null si no se pudo consultar. */
  amount: number | null;
  /** Consultando el saldo: muestra un indicador en lugar del valor. */
  loading?: boolean;
  children?: ReactNode;
};

export function BalanceCard({ title = 'Estado de la cuenta', amount, loading, children }: Props) {
  return (
    <Card title={title}>
      {loading ? (
        <ActivityIndicator accessibilityLabel="Cargando saldo" color={colors.brandDark} style={styles.loading} />
      ) : (
        <Text style={styles.amount}>{amount === null ? '—' : formatAmount(amount)}</Text>
      )}
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  amount: typography.amount,
  loading: {
    alignSelf: 'flex-start',
    height: 34,
  },
});
