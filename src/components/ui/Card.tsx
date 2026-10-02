import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ title, children, style }: Props) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
