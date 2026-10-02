import { ScrollView, StyleSheet } from 'react-native';
import { router, type Href } from 'expo-router';

import { Chip } from '@/components/ui/Chip';
import { spacing } from '@/constants/theme';

export type SectionKey = 'inicio' | 'pagos' | 'reservas' | 'general';

const sections: { key: SectionKey; label: string; href: Href }[] = [
  { key: 'inicio', label: 'Inicio', href: '/inicio' },
  { key: 'pagos', label: 'Pagos', href: '/pagos' },
  { key: 'reservas', label: 'Reservas', href: '/reservas' },
  { key: 'general', label: 'General', href: '/general' },
];

type Props = {
  /** Sección activa; se omite en pantallas secundarias como PQRS. */
  active?: SectionKey;
};

/** Pestañas superiores de la sección principal (Inicio, Pagos, Reservas, General). */
export function SegmentedTabs({ active }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {sections.map((section) => (
        <Chip
          key={section.key}
          label={section.label}
          selected={section.key === active}
          onPress={() => section.key !== active && router.replace(section.href)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 0,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
