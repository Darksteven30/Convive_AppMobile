import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { NewsForm } from '@/components/news/NewsForm';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { NewsError, deleteNews, getNews, updateNews, type NewsInput, type NewsItem } from '@/services/news.service';

/** RF19 · Editar o eliminar un comunicado (administrador). */
export default function EditarComunicadoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [item, setItem] = useState<NewsItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    getNews(id, user)
      .then((value) => active && setItem(value))
      .catch((e) => active && setLoadError(e instanceof NewsError && e.code === 'not_found' ? MSG.RF19.notFound : MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  const save = async (input: NewsInput) => {
    if (!user || !item) return;
    await updateNews(item.id, input, user);
    showToast('success', MSG.RF19.updated);
    router.back();
  };

  const remove = async () => {
    if (!user || !item) return;
    try {
      await deleteNews(item.id, user);
      showToast('success', MSG.RF19.deleted);
      router.back();
    } catch (e) {
      if (e instanceof NewsError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF19.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof NewsError && e.code === 'not_found') {
        // Otra persona ya lo eliminó: el resultado es el mismo.
        router.back();
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  const confirmDelete = () =>
    showDialog({
      title: MSG.RF19.deleteTitle,
      message: MSG.RF19.deleteMessage,
      actions: [{ label: 'Eliminar', primary: true, onPress: remove }, { label: 'Cancelar' }],
    });

  if (!item) {
    return (
      <Screen header={<AppHeader title="Editar comunicado" left="back" showAvatar={false} />}>
        {loadError ? (
          <Text style={styles.muted}>{loadError}</Text>
        ) : (
          <ActivityIndicator color={colors.brandDark} style={styles.loading} />
        )}
      </Screen>
    );
  }

  return (
    <NewsForm
      title="Editar comunicado"
      initial={{ title: item.title, body: item.body, visibleUntil: item.visibleUntil }}
      submitLabel="Guardar cambios"
      onSubmit={save}
      onDelete={confirmDelete}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
