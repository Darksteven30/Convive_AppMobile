import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { PhotoPicker } from '@/components/pqrs/PhotoPicker';
import { PqrsStatusChip } from '@/components/pqrs/PqrsStatusChip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  DESCRIPTION_MAX,
  PQRS_TYPES,
  PqrsError,
  createPqrs,
  formatPqrsNumber,
  listMyPqrs,
  pqrsTypeLabel,
  validatePqrs,
  type Photo,
  type PqrsErrors,
  type PqrsSummary,
  type PqrsType,
} from '@/services/pqrs.service';

/**
 * RF07 · PQRS: lista de las solicitudes del usuario con su estado y formulario para radicar una
 * petición, queja, reclamo, sugerencia o reporte de daño con hasta 3 fotos.
 */
export default function PqrsScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();

  const [items, setItems] = useState<PqrsSummary[] | null>(null);
  const [type, setType] = useState<PqrsType | null>(null);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [errors, setErrors] = useState<PqrsErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    (isActive: () => boolean = () => true) => {
      if (!user) return;
      listMyPqrs(user)
        .then((list) => isActive() && setItems(list))
        .catch(() => {
          if (!isActive()) return;
          setItems([]);
          showToast('error', MSG.general.unexpected);
        });
    },
    [user, showToast],
  );

  // Se recarga cada vez que la pantalla vuelve a tener el foco (p. ej. al volver del detalle).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  const draft = { type: type ?? undefined, description, photos };
  const requiredComplete =
    type !== null && description.trim().length > 0 && (type !== 'reporte_dano' || photos.length > 0);

  const setFieldError = (field: keyof PqrsErrors, message?: string | null) =>
    setErrors((current) => ({ ...current, [field]: message ?? undefined }));

  const changeType = (value: string) => {
    const next = value as PqrsType;
    setType(next);
    setFieldError('type', null);
    // El reporte de daño exige al menos una foto (MSG-RF07-07).
    setFieldError('photos', next === 'reporte_dano' && photos.length === 0 ? MSG.RF07.photoRequired : null);
  };

  const changePhotos = (next: Photo[]) => {
    setPhotos(next);
    if (next.length > 0 || type !== 'reporte_dano') setFieldError('photos', null);
    else setFieldError('photos', MSG.RF07.photoRequired);
  };

  const resetForm = () => {
    setType(null);
    setDescription('');
    setPhotos([]);
    setErrors({});
  };

  const submit = async () => {
    const validation = validatePqrs(draft);
    setErrors(validation);
    if (!user || !type || Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      const created = await createPqrs({ type, description, photos }, user);
      resetForm();
      showDialog({ message: MSG.RF07.filed(formatPqrsNumber(created.number)), actions: [{ label: 'Aceptar', primary: true }] });
      load();
    } catch (e) {
      if (e instanceof PqrsError && e.code === 'validation') {
        setErrors(e.fieldErrors);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="pqrs" />
        </>
      }
    >
      <View>
        {items === null ? (
          <ActivityIndicator color={colors.brandDark} style={styles.loading} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>{MSG.RF07.empty}</Text>
        ) : (
          items.map((item) => {
            const code = formatPqrsNumber(item.number);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Ver ${code}`}
                onPress={() => router.push({ pathname: '/pqrs/[id]', params: { id: item.id } })}
                style={styles.item}
              >
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {code} — {pqrsTypeLabel(item.type)}
                  </Text>
                  <Text style={styles.itemDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>
                <PqrsStatusChip status={item.status} />
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })
        )}
      </View>

      <Card>
        <Text style={styles.formTitle}>Nueva PQRS</Text>
        <SelectField
          label="Tipo"
          placeholder="Selecciona el tipo"
          options={PQRS_TYPES}
          value={type}
          onChange={changeType}
          onDismiss={() => !type && setFieldError('type', MSG.RF07.typeRequired)}
          error={errors.type}
          placement="center"
        />
        <TextField
          label="Descripción"
          placeholder="Cuéntanos qué pasó (mínimo 20 caracteres)"
          value={description}
          onChangeText={(value) => {
            setDescription(value);
            setFieldError('description', null);
          }}
          onBlur={() => description && setFieldError('description', validatePqrs(draft).description)}
          error={errors.description}
          maxLength={DESCRIPTION_MAX}
          showCounter
          multiline
        />
        <PhotoPicker
          label={type === 'reporte_dano' ? 'Fotos' : 'Fotos (opcional)'}
          photos={photos}
          onChange={changePhotos}
          error={errors.photos}
          onError={(message) =>
            setFieldError('photos', message ?? (type === 'reporte_dano' && photos.length === 0 ? MSG.RF07.photoRequired : null))
          }
        />
        <Button
          label="Radicar"
          variant="brand"
          block
          disabled={!requiredComplete}
          loading={saving}
          onPress={submit}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    color: colors.text,
  },
  itemDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brandDark,
  },
});
