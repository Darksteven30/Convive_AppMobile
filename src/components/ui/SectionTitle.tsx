import { StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

type Props = {
  title: string;
  centered?: boolean;
};

/** Título dentro de una píldora gris, como "Efectuar pago" o "Resumen financiero". */
export function SectionTitle({ title, centered }: Props) {
  return <Text style={[styles.title, centered && styles.centered]}>{title}</Text>;
}

const styles = StyleSheet.create({
  title: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    overflow: 'hidden',
  },
  centered: {
    alignSelf: 'center',
  },
});
