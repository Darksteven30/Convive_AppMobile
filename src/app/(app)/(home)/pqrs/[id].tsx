import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { PhotoViewer } from '@/components/pqrs/PhotoViewer';
import { PqrsStatusChip } from '@/components/pqrs/PqrsStatusChip';
import { Card } from '@/components/ui/Card';
import { MSG } from '@/constants/messages';
import { colors, radius, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import {
  PqrsError,
  formatPqrsNumber,
  getPqrsDetail,
  pqrsTypeLabel,
  type PqrsDetail,
  type PqrsStatus,
} from '@/services/pqrs.service';
import { formatDateTime } from '@/utils/date';

type Entry = { id: string; title: string; message: string; status: PqrsStatus; createdAt: string };

/** RF07 · Detalle de una PQRS: datos, fotos e historial de respuestas de la administración. */
export default function PqrsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const [detail, setDetail] = useState<PqrsDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Foto abierta en pantalla completa (posición), o null.
  const [viewing, setViewing] = useState<number | null>(null);

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

  // Historial: la radicación y luego cada respuesta, del más antiguo al más reciente.
  const history: Entry[] = detail
    ? [
        { id: 'radicada', title: 'Radicada', message: 'Recibimos tu solicitud.', status: 'pendiente', createdAt: detail.createdAt },
        ...detail.responses.map((response) => ({
          id: response.id,
          title: response.author,
          message: response.message,
          status: response.status,
          createdAt: response.createdAt,
        })),
      ]
    : [];

  return (
    <Screen header={<AppHeader title={title} left="back" showAvatar={false} />}>
      {error ? (
        <Text style={styles.muted}>{error}</Text>
      ) : !detail ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : (
        <>
          <Card>
            <View style={styles.headerRow}>
              <Text style={styles.type}>{pqrsTypeLabel(detail.type)}</Text>
              <PqrsStatusChip status={detail.status} />
            </View>
            <Text style={styles.muted}>Radicada el {formatDateTime(new Date(detail.createdAt))}</Text>
            <Text style={styles.description}>{detail.description}</Text>
            {detail.photos.length > 0 ? (
              <View style={styles.photos}>
                {detail.photos.map((photo, index) => (
                  <Pressable
                    key={photo.storagePath ?? photo.uri}
                    accessibilityRole="button"
                    accessibilityLabel={`Ampliar foto ${index + 1}`}
                    onPress={() => setViewing(index)}
                  >
                    <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel={`Foto ${index + 1}`} />
                  </Pressable>
                ))}
              </View>
            ) : null}
          </Card>

          <Card title="Historial de respuestas">
            {history.map((entry) => (
              <View key={entry.id} style={styles.entry}>
                <View style={styles.headerRow}>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  <PqrsStatusChip status={entry.status} />
                </View>
                <Text style={styles.muted}>{formatDateTime(new Date(entry.createdAt))}</Text>
                <Text style={styles.description}>{entry.message}</Text>
              </View>
            ))}
            {detail.responses.length === 0 ? <Text style={styles.muted}>{MSG.RF07.noResponses}</Text> : null}
          </Card>

          <PhotoViewer photos={detail.photos} index={viewing} onChange={setViewing} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  type: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  photos: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  photo: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  entry: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  entryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
