import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { NewsRow } from '@/components/news/NewsRow';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { listNews, type NewsItem } from '@/services/news.service';

/**
 * RF19 · Histórico de noticias: todos los comunicados del conjunto, vigentes y vencidos, del más
 * reciente al más antiguo. Los vencidos ya no salen en Inicio, pero quedan aquí como registro.
 */
export default function HistoricoNoticiasScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();
  const [items, setItems] = useState<NewsItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listNews(user)
        .then((list) => active && setItems(list))
        .catch(() => {
          if (!active) return;
          setItems([]);
          showToast('error', MSG.general.unexpected);
        });
      return () => {
        active = false;
      };
    }, [user, showToast]),
  );

  return (
    <Screen header={<AppHeader title="Histórico de noticias" left="back" showAvatar={false} />}>
      {items === null ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{MSG.RF19.empty}</Text>
      ) : (
        <View>
          {items.map((item) => (
            <NewsRow
              key={item.id}
              item={item}
              accessibilityLabel={`Leer ${item.title}`}
              onPress={() => router.push({ pathname: '/noticias/[id]', params: { id: item.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
});
