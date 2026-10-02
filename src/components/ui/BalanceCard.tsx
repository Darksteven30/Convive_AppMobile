import { StyleSheet, Text } from 'react-native';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { typography } from '@/constants/theme';
import { formatCurrency } from '@/utils/format';

type Props = {
  title?: string;
  amount: number;
  children?: ReactNode;
};

export function BalanceCard({ title = 'Estado de la cuenta', amount, children }: Props) {
  return (
    <Card title={title}>
      <Text style={styles.amount}>{formatCurrency(amount)}</Text>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  amount: typography.amount,
});
