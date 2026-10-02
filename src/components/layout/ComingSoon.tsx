import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { colors, spacing } from '@/constants/theme';

type Props = {
  title: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

/** Pantalla provisional para secciones aún sin diseño. */
export function ComingSoon({ title, icon }: Props) {
  return (
    <Screen header={<AppHeader />}>
      <View style={styles.container}>
        <Ionicons name={icon} size={48} color={colors.textMuted} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>Esta sección estará disponible próximamente.</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xxl * 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  text: {
    fontSize: 14,
    color: colors.textMuted,
  },
});
