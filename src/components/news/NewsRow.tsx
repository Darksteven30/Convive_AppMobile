import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/constants/theme';
import { isExpired, type NewsItem } from '@/services/news.service';
import { formatDateTime } from '@/utils/date';

type Props = {
  item: NewsItem;
  accessibilityLabel: string;
  onPress: () => void;
  /** Muestra el inicio del mensaje debajo del título (lista del administrador). */
  showPreview?: boolean;
};

/**
 * Fila de un comunicado (RF19): título, fecha de publicación y flecha ›. Si tiene «visible hasta»,
 * lo muestra; si ya pasó, la marca «Vencido» (solo sale en el histórico y en la lista del administrador).
 */
export function NewsRow({ item, accessibilityLabel, onPress, showPreview }: Props) {
  const expired = isExpired(item);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.item}>
      <View style={styles.body}>
        <Text style={[styles.title, expired && styles.expiredText]} numberOfLines={2}>
          {item.title}
        </Text>
        {showPreview ? (
          <Text style={styles.preview} numberOfLines={1}>
            {item.body}
          </Text>
        ) : null}
        <Text style={styles.date}>{formatDateTime(new Date(item.publishedAt))}</Text>
        {item.visibleUntil && !expired ? (
          <Text style={styles.date}>Visible hasta {formatDateTime(new Date(item.visibleUntil))}</Text>
        ) : null}
      </View>
      {expired ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>Vencido</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    color: colors.text,
  },
  expiredText: {
    color: colors.textMuted,
  },
  preview: {
    fontSize: 12,
    color: colors.text,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
