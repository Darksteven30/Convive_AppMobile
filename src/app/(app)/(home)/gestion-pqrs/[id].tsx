import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { PqrsDetailContent } from '@/components/pqrs/PqrsDetailContent';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  COMMENT_MAX,
  NEXT_STATUSES,
  PQRS_STATUS_LABELS,
  PqrsError,
  changePqrsStatus,
  formatPqrsNumber,
  getPqrsDetail,
  validateStatusChange,
  type PqrsDetail,
  type PqrsErrors,
  type PqrsStatus,
} from '@/services/pqrs.service';

/**
 * RF08 · Detalle de una PQRS para el administrador: los datos y el historial (como los ve el
 * propietario) y el cambio de estado Pendiente → En proceso → Resuelto con su comentario.
 */
export default function GestionPqrsDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();

  const [detail, setDetail] = useState<PqrsDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<PqrsStatus | null>(null);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState<PqrsErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!user || !id) return () => undefined;
    let active = true;
    getPqrsDetail(id, user)
      .then((value) => active && setDetail(value))
      .catch((e) => active && setLoadError(e instanceof PqrsError && e.code === 'not_found' ? MSG.RF07.notFound : MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  useEffect(() => load(), [load]);

  const setFieldError = (field: keyof PqrsErrors, message?: string | null) =>
    setErrors((current) => ({ ...current, [field]: message ?? undefined }));

  const changeStatus = (value: string) => {
    const next = value as PqrsStatus;
    setStatus(next);
    setFieldError('status', null);
    // Al elegir «Resuelto» el comentario pasa a ser obligatorio.
    if (next !== 'resuelto' && !comment.trim()) setFieldError('comment', null);
  };

  const save = async () => {
    if (!user || !detail) return;
    const input = { pqrsId: detail.id, currentStatus: detail.status, status: status ?? undefined, comment };
    const validation = validateStatusChange(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0 || !status) return;

    setSaving(true);
    try {
      await changePqrsStatus({ ...input, status }, user);
      showToast('success', MSG.RF08.updated);
      setStatus(null);
      setComment('');
      setErrors({});
      load();
    } catch (e) {
      if (e instanceof PqrsError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF08.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof PqrsError && e.code === 'validation') {
        setErrors(e.fieldErrors);
        // Otra persona pudo cambiarla: se muestra el estado actual.
        if (e.fieldErrors.status) load();
      } else if (e instanceof PqrsError && e.code === 'not_found') {
        setLoadError(MSG.RF07.notFound);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    } finally {
      setSaving(false);
    }
  };

  const title = detail ? `PQRS ${formatPqrsNumber(detail.number)}` : 'PQRS';
  const options = detail ? NEXT_STATUSES[detail.status].map((value) => ({ value, label: PQRS_STATUS_LABELS[value] })) : [];

  return (
    <Screen header={<AppHeader title={title} left="back" showAvatar={false} />}>
      {loadError ? (
        <Text style={styles.muted}>{loadError}</Text>
      ) : !detail ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : (
        <>
          <PqrsDetailContent detail={detail} />

          <Card title="Cambiar estado">
            {options.length === 0 ? (
              <Text style={styles.muted}>{MSG.RF08.finalStatus}</Text>
            ) : (
              <>
                <Text style={styles.muted}>Estado actual: {PQRS_STATUS_LABELS[detail.status]}</Text>
                <SelectField
                  label="Estado"
                  placeholder="Selecciona el nuevo estado"
                  options={options}
                  value={status}
                  onChange={changeStatus}
                  error={errors.status}
                  placement="center"
                />
                <TextField
                  label={status === 'resuelto' ? 'Comentario / respuesta' : 'Comentario / respuesta (opcional)'}
                  placeholder="Lo verá el propietario en el historial"
                  value={comment}
                  onChangeText={(value) => {
                    setComment(value);
                    setFieldError('comment', null);
                  }}
                  onBlur={() =>
                    comment && setFieldError('comment', validateStatusChange({ currentStatus: detail.status, status: status ?? undefined, comment }).comment)
                  }
                  error={errors.comment}
                  maxLength={COMMENT_MAX}
                  showCounter
                  multiline
                />
                <Button label="Guardar" block disabled={status === null} loading={saving} onPress={save} />
              </>
            )}
          </Card>
        </>
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
