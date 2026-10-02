import { Alert, Text } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { typography } from '@/constants/theme';
import { accountBalance, paymentHistory } from '@/data/mock';

export default function PagosScreen() {
  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="pagos" />
        </>
      }
    >
      <BalanceCard amount={accountBalance}>
        <Button label="Abonar" variant="outline" pill onPress={() => router.push('/pago/seleccion')} />
      </BalanceCard>

      <Card title="Historial de pagos">
        {paymentHistory.map((payment) => (
          <Text key={payment.id} style={typography.body}>
            {payment.label}
          </Text>
        ))}
        <Button
          label="Descargar comprobante"
          variant="success"
          pill
          onPress={() => Alert.alert('Comprobante', 'La descarga estará disponible próximamente.')}
        />
      </Card>
    </Screen>
  );
}
