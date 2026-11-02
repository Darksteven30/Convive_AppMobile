import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { NewsRow } from '@/components/news/NewsRow';
import { AccountStatusCard } from '@/components/payments/AccountStatusCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MSG } from '@/constants/messages';
import { hasPermission } from '@/constants/permissions';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { useAccountStatus } from '@/hooks/useAccountStatus';
import { LATEST_NEWS_LIMIT, listNews, type NewsItem } from '@/services/news.service';

export default function InicioScreen() {
  const { role, user } = useSession();
  const canPay = hasPermission(role, 'pagos');
  const account = useAccountStatus(canPay);
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [newsFailed, setNewsFailed] = useState(false);

  // RF19: últimos comunicados vigentes del conjunto (los vencidos quedan en el histórico). Se recargan
  // al volver a Inicio (p. ej. tras publicar uno).
  const loadNews = useCallback(() => {
    if (!user) return;
    let active = true;
    setNewsFailed(false);
    listNews(user, { limit: LATEST_NEWS_LIMIT, activeOnly: true })
      .then((items) => active && setNews(items))
      .catch(() => active && setNewsFailed(true));
    return () => {
      active = false;
    };
  }, [user]);

  useFocusEffect(loadNews);

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
        {newsFailed ? (
          <>
            <Text style={styles.muted}>{MSG.RF19.loadFailed}</Text>
            <Button label="Reintentar" variant="outline" pill onPress={loadNews} />
          </>
        ) : news === null ? (
          <ActivityIndicator color={colors.brandDark} />
        ) : news.length === 0 ? (
          <Text style={styles.muted}>{MSG.RF19.emptyActive}</Text>
        ) : (
          <View>
            {news.map((item) => (
              <NewsRow
                key={item.id}
                item={item}
                accessibilityLabel={`Leer ${item.title}`}
                onPress={() => router.push({ pathname: '/noticias/[id]', params: { id: item.id } })}
              />
            ))}
          </View>
        )}
        <View style={styles.row}>
          <Button label="Histórico de noticias" variant="outline" pill onPress={() => router.push('/noticias')} />
          <Button label="Informar novedad" variant="outline" pill onPress={() => router.push('/pqrs')} />
        </View>
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
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
