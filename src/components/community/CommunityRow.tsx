import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  title: string;
  /** Líneas secundarias debajo del título (vacías se omiten). */
  lines: (string | null | undefined)[];
  /** Etiqueta a la derecha, p. ej. «Sin cuenta». */
  tag?: string | null;
  accessibilityLabel: string;
  onPress: () => void;
};

/** Fila de una persona o una unidad del conjunto (RF20): título, datos y flecha ›. */
export function CommunityRow({ title, lines, tag, accessibilityLabel, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={styles.item}>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {lines.filter(Boolean).map((line) => (
          <Text key={line} style={styles.line} numberOfLines={1}>
            {line}
          </Text>
        ))}
      </View>
      {tag ? (
        <View style={styles.tag}>
          <Text style={styles.tagText}>{tag}</Text>
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
    paddingVertical: spacing.md,
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
  line: {
    fontSize: 12,
    color: colors.textMuted,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
