import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import type { AccountStatus } from '@/services/payments.service';

type Props = {
  status: AccountStatus | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
};

/**
 * Tarjeta «Estado de la cuenta» de Inicio y Pagos (RF02): saldo pendiente de la unidad con
 * «Abonar»; con saldo $ 0 muestra «Estás al día» en verde y oculta «Abonar». Si no se pudo
 * consultar, MSG-RF02-05 con «Reintentar».
 */
export function AccountStatusCard({ status, loading, failed, onRetry }: Props) {
  if (failed) {
    return (
      <Card title="Estado de la cuenta">
        <Text style={styles.text}>{MSG.RF02.loadFailed}</Text>
        <Button label="Reintentar" variant="outline" pill onPress={onRetry} />
      </Card>
    );
  }

  const upToDate = status !== null && status.total <= 0;
  return (
    <BalanceCard amount={status?.total ?? null} loading={loading}>
      {upToDate ? (
        <View style={styles.upToDate}>
          <Ionicons name="checkmark-circle" size={18} color={colors.toastSuccess} />
          <Text style={styles.upToDateText}>{MSG.RF02.upToDate}</Text>
        </View>
      ) : status ? (
        <Button label="Abonar" variant="outline" pill onPress={() => router.push('/pago/seleccion')} />
      ) : null}
    </BalanceCard>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: colors.text,
  },
  upToDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  upToDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.toastSuccess,
  },
});
