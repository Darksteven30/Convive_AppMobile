import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { spacing, typography } from '@/constants/theme';
import { accountBalance, news } from '@/data/mock';

export default function InicioScreen() {
  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="inicio" />
        </>
      }
    >
      <BalanceCard amount={accountBalance}>
        <Button label="Abonar" variant="outline" pill onPress={() => router.push('/pago/seleccion')} />
      </BalanceCard>

      <Card title="Acceso rápido">
        <View style={styles.row}>
          <Button label="Reservar zona" variant="outline" pill onPress={() => router.replace('/reservas')} />
          <Button label="Realizar PQR" variant="outline" pill onPress={() => router.push('/pqrs')} />
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
