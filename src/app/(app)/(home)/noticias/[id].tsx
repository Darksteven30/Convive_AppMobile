import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { MSG } from '@/constants/messages';
import { colors, layout, radius, spacing, typography } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { NewsError, getNews, isExpired, type NewsItem } from '@/services/news.service';
import { formatDateTime } from '@/utils/date';

/** Cierra la ventana; si se abrió directo (p. ej. desde la push de RF09), vuelve a Inicio. */
function close() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/inicio');
  }
}

/**
 * RF19 · Detalle de un comunicado en una ventana centrada sobre la pantalla anterior: título, quién
 * y cuándo lo publicó, y el mensaje completo (se desplaza si es largo).
 */
export default function NoticiaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [item, setItem] = useState<NewsItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    getNews(id, user)
      .then((value) => active && setItem(value))
      .catch((e) => active && setError(e instanceof NewsError && e.code === 'not_found' ? MSG.RF19.notFound : MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Cerrar" style={StyleSheet.absoluteFill} onPress={close} />
      <View accessibilityViewIsModal style={styles.dialog}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {item?.title ?? 'Comunicado'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={close} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        {error ? (
          <Text style={styles.muted}>{error}</Text>
        ) : !item ? (
          <ActivityIndicator color={colors.brandDark} style={styles.loading} />
        ) : (
          <>
            <View>
              <Text style={styles.muted}>
                Publicado por {item.author} · {formatDateTime(new Date(item.publishedAt))}
              </Text>
              {item.updatedAt ? <Text style={styles.muted}>Editado el {formatDateTime(new Date(item.updatedAt))}</Text> : null}
              {item.visibleUntil ? (
                <Text style={styles.muted}>
                  {isExpired(item) ? 'Venció el' : 'Visible hasta'} {formatDateTime(new Date(item.visibleUntil))}
                </Text>
              ) : null}
            </View>
            <ScrollView style={styles.scroll}>
              <Text style={styles.body}>{item.body}</Text>
            </ScrollView>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  dialog: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    maxHeight: '80%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    ...typography.subtitle,
    flex: 1,
    color: colors.text,
  },
  loading: {
    paddingVertical: spacing.lg,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  scroll: {
    flexGrow: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
});
