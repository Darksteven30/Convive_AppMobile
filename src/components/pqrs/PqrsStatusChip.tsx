import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { PQRS_STATUS_LABELS, type PqrsStatus } from '@/services/pqrs.service';

const palette: Record<PqrsStatus, { bg: string; fg: string }> = {
  pendiente: { bg: colors.statusPendingBg, fg: colors.statusPendingText },
  en_proceso: { bg: colors.statusInProgressBg, fg: colors.statusInProgressText },
  resuelto: { bg: colors.statusResolvedBg, fg: colors.statusResolvedText },
};

/** Chip de estado de una PQRS (RF07): Pendiente, En proceso o Resuelto. */
export function PqrsStatusChip({ status }: { status: PqrsStatus }) {
  const { bg, fg } = palette[status];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{PQRS_STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
  },
});
