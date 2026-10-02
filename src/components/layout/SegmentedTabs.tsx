import { ScrollView, StyleSheet } from 'react-native';
import { router, type Href } from 'expo-router';

import { Chip } from '@/components/ui/Chip';
import { hasPermission, type Permission } from '@/constants/permissions';
import { spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';

export type SectionKey = 'panel' | 'visitantes' | 'inicio' | 'pagos' | 'reservas' | 'general';

const sections: { key: SectionKey; label: string; href: Href; permission?: Permission }[] = [
  { key: 'panel', label: 'Panel', href: '/panel', permission: 'panel' },
  { key: 'visitantes', label: 'Visitantes', href: '/visitantes', permission: 'visitantes' },
  { key: 'inicio', label: 'Inicio', href: '/inicio' },
  { key: 'pagos', label: 'Pagos', href: '/pagos', permission: 'pagos' },
  { key: 'reservas', label: 'Reservas', href: '/reservas' },
  { key: 'general', label: 'General', href: '/general', permission: 'general' },
];

type Props = {
  /** Sección activa; se omite en pantallas secundarias como PQRS. */
  active?: SectionKey;
};

/** Pestañas superiores de la sección principal, filtradas según el rol. */
export function SegmentedTabs({ active }: Props) {
  const { role } = useSession();
  const visible = sections.filter((section) => !section.permission || hasPermission(role, section.permission));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.container}
    >
      {visible.map((section) => (
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
    flexShrink: 0,
  },
  row: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
});
