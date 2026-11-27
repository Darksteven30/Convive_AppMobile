import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { PqrsDetailContent } from '@/components/pqrs/PqrsDetailContent';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { PqrsError, formatPqrsNumber, getPqrsDetail, type PqrsDetail } from '@/services/pqrs.service';

/** RF07 · Detalle de una PQRS: datos, fotos e historial de respuestas de la administración. */
export default function PqrsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [detail, setDetail] = useState<PqrsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    getPqrsDetail(id, user)
      .then((value) => active && setDetail(value))
      .catch((e) => active && setError(e instanceof PqrsError && e.code === 'not_found' ? MSG.RF07.notFound : MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  const title = detail ? `PQRS ${formatPqrsNumber(detail.number)}` : 'PQRS';

  return (
    <Screen header={<AppHeader title={title} left="back" showAvatar={false} />}>
      {error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : !detail ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : (
        <PqrsDetailContent detail={detail} />
      )}
    </Screen>
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
