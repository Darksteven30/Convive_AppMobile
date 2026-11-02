import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { NewsRow } from '@/components/news/NewsRow';
import { Button } from '@/components/ui/Button';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { listNews, type NewsItem } from '@/services/news.service';

/** RF19 · Comunicados del conjunto (administrador): publicar uno nuevo, editarlos o eliminarlos. */
export default function GestionNoticiasScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();
  const [items, setItems] = useState<NewsItem[] | null>(null);

  // Se recarga cada vez que la pantalla vuelve a tener el foco (al publicar, editar o eliminar).
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
    <Screen
      header={<AppHeader title="Comunicados" left="back" showAvatar={false} />}
      footer={
        <Button
          label="Publicar comunicado"
          variant="brand"
          pill
          block
          onPress={() => router.push('/gestion-noticias/nuevo')}
        />
      }
    >
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
              showPreview
              accessibilityLabel={`Editar ${item.title}`}
              onPress={() => router.push({ pathname: '/gestion-noticias/[id]', params: { id: item.id } })}
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
