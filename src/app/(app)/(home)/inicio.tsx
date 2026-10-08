import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { AccountStatusCard } from '@/components/payments/AccountStatusCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { hasPermission } from '@/constants/permissions';
import { spacing, typography } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { news } from '@/data/mock';
import { useAccountStatus } from '@/hooks/useAccountStatus';

export default function InicioScreen() {
  const { role } = useSession();
  const canPay = hasPermission(role, 'pagos');
  const account = useAccountStatus(canPay);

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="inicio" />
        </>
      }
    >
      {/* RF02: mismo «Estado de la cuenta» que en Pagos. */}
      {canPay && (
        <AccountStatusCard
          status={account.status}
          loading={account.loading}
          failed={account.failed}
          onRetry={account.reload}
        />
      )}

      <Card title="Acceso rápido">
        <View style={styles.row}>
          <Button label="Reservar zona" variant="outline" pill onPress={() => router.replace('/reservas')} />
          <Button label="Radicar PQRS" variant="outline" pill onPress={() => router.push('/pqrs')} />
        </View>
      </Card>

      <Card title="Últimas noticias">
        {news.map((item) => (
          <Text key={item.id} style={typography.body}>
            {item.title}
          </Text>
        ))}
        <Button label="Informar novedad" variant="outline" pill onPress={() => router.push('/pqrs')} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
