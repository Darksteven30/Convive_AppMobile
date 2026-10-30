import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing, typography } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { expectedVisitors } from '@/data/mock';
import { formatTime } from '@/utils/date';
import {
  DEFAULT_DOCUMENT_TYPE,
  DOCUMENT_MAX,
  DOCUMENT_TYPES,
  NAME_MAX,
  PLATE_MAX,
  VisitorError,
  findVisitorName,
  isValidDocument,
  listUnits,
  listVisitorsInside,
  normalizePlate,
  registerEntry,
  registerExit,
  validateEntry,
  type DocumentType,
  type Unit,
  type Visit,
  type VisitorErrors,
  type VisitorField,
} from '@/services/visitors.service';

/** CC, CE y TI solo admiten números; el pasaporte, letras (en mayúsculas) y números. */
function cleanDocument(type: DocumentType, value: string): string {
  return type === 'PASAPORTE' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value.replace(/\D/g, '');
}

/**
 * Pantalla principal de vigilancia: registro de ingreso y salida de visitantes (RF10) y los
 * visitantes esperados hoy (RF01). Las horas de entrada y salida las pone el servidor.
 */
export default function VisitantesScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();

  const [units, setUnits] = useState<Unit[]>([]);
  const [inside, setInside] = useState<Visit[] | null>(null);
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>(DEFAULT_DOCUMENT_TYPE);
  const [documentNumber, setDocumentNumber] = useState('');
  const [unitId, setUnitId] = useState<string | null>(null);
  const [plate, setPlate] = useState('');
  const [errors, setErrors] = useState<VisitorErrors>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);

  const showForbidden = useCallback(
    () => showDialog({ message: MSG.RF10.forbidden, actions: [{ label: 'Aceptar', primary: true }] }),
    [showDialog],
  );

  const loadInside = useCallback(() => {
    if (!user) return;
    listVisitorsInside(user)
      .then(setInside)
      .catch(() => {
        setInside([]);
        showToast('error', MSG.general.unexpected);
      });
  }, [user, showToast]);

  // Se recarga al volver a la pantalla: otro vigilante pudo registrar entradas o salidas.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      Promise.all([listUnits(user), listVisitorsInside(user)])
        .then(([unitList, visits]) => {
          if (!active) return;
          setUnits(unitList);
          setInside(visits);
        })
        .catch((e) => {
          if (!active) return;
          setInside([]);
          if (e instanceof VisitorError && e.code === 'forbidden') showForbidden();
          else showToast('error', MSG.general.unexpected);
        });
      return () => {
        active = false;
      };
    }, [user, showForbidden, showToast]),
  );

  const setFieldError = (field: VisitorField, message?: string | null) =>
    setErrors((current) => ({ ...current, [field]: message ?? undefined }));

  const input = { name, documentType, documentNumber, unitId, plate };

  /** Si el documento ya tiene registros y el nombre está vacío, lo autocompleta. */
  const autocompleteName = async (type: DocumentType, number: string) => {
    if (!user || name.trim() !== '' || !isValidDocument(type, number)) return;
    try {
      const found = await findVisitorName(type, number, user);
      if (found) {
        setName((current) => (current.trim() === '' ? found : current));
        setFieldError('name', null);
      }
    } catch {
      // Autocompletar es una ayuda: si falla, la vigilancia escribe el nombre.
    }
  };

  const changeDocumentType = (value: string) => {
    const type = value as DocumentType;
    const number = cleanDocument(type, documentNumber).slice(0, DOCUMENT_MAX[type]);
    setDocumentType(type);
    setDocumentNumber(number);
    setFieldError('documentNumber', null);
    autocompleteName(type, number);
  };

  const resetForm = () => {
    setName('');
    setDocumentType(DEFAULT_DOCUMENT_TYPE);
    setDocumentNumber('');
    setUnitId(null);
    setPlate('');
    setErrors({});
  };

  const handleError = (e: unknown) => {
    if (e instanceof VisitorError && e.code === 'forbidden') {
      showForbidden();
    } else if (e instanceof VisitorError && e.code === 'no_active_entry') {
      showDialog({ message: MSG.RF10.noActiveEntry, actions: [{ label: 'Aceptar', primary: true }] });
      loadInside();
    } else if (e instanceof VisitorError && e.code === 'validation') {
      setErrors(e.fieldErrors);
    } else {
      showToast('error', MSG.general.unexpected);
    }
  };

  const submit = async () => {
    if (!user) return;
    const validation = validateEntry(input);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      const visit = await registerEntry(input, user);
      showToast('success', MSG.RF10.entryRegistered(visit.name, visit.unit, formatTime(new Date(visit.enteredAt))));
      resetForm();
      setInside((current) => [visit, ...(current ?? []).filter((item) => item.id !== visit.id)]);
    } catch (e) {
      handleError(e);
    } finally {
      setSaving(false);
    }
  };

  const exit = async (visit: Visit) => {
    if (!user) return;
    setLeaving(visit.id);
    try {
      const updated = await registerExit(visit.id, user);
      showToast('success', MSG.RF10.exitRegistered(updated.name, formatTime(new Date(updated.exitedAt))));
      setInside((current) => (current ?? []).filter((item) => item.id !== visit.id));
    } catch (e) {
      handleError(e);
    } finally {
      setLeaving(null);
    }
  };

  const isPassport = documentType === 'PASAPORTE';
  const unitOptions = units.map((unit) => ({ value: unit.id, label: unit.name, description: unit.address }));

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="visitantes" />
        </>
      }
    >
      <Card title="Registrar ingreso">
        <TextField
          label="Nombre completo"
          placeholder="Nombre y apellidos del visitante"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setFieldError('name', null);
          }}
          onBlur={() => name && setFieldError('name', validateEntry(input).name)}
          error={errors.name}
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoComplete="off"
        />
        <SelectField
          label="Tipo de documento"
          options={DOCUMENT_TYPES}
          value={documentType}
          onChange={changeDocumentType}
          placement="center"
        />
        <TextField
          label="Número de documento"
          placeholder={isPassport ? 'Letras y números' : 'Solo números'}
          value={documentNumber}
          onChangeText={(value) => {
            setDocumentNumber(cleanDocument(documentType, value));
            setFieldError('documentNumber', null);
          }}
          onBlur={() => {
            if (!documentNumber) return;
            setFieldError('documentNumber', validateEntry(input).documentNumber);
            autocompleteName(documentType, documentNumber);
          }}
          error={errors.documentNumber}
          maxLength={DOCUMENT_MAX[documentType]}
          keyboardType={isPassport ? 'default' : 'number-pad'}
          autoCapitalize={isPassport ? 'characters' : 'none'}
          autoCorrect={false}
        />
        <SelectField
          label="Unidad que autoriza"
          placeholder="Selecciona la unidad"
          options={unitOptions}
          value={unitId}
          onChange={(value) => {
            setUnitId(value);
            setFieldError('unitId', null);
          }}
          error={errors.unitId}
          placement="center"
          searchable
          emptyText="No encontramos unidades con ese nombre."
        />
        <TextField
          label="Placa del vehículo (opcional)"
          placeholder="AAA123 o AAA12A"
          value={plate}
          onChangeText={(value) => {
            setPlate(normalizePlate(value));
            setFieldError('plate', null);
          }}
          onBlur={() => plate && setFieldError('plate', validateEntry(input).plate)}
          error={errors.plate}
          maxLength={PLATE_MAX}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button label="Registrar entrada" block loading={saving} onPress={submit} />
      </Card>

      <Text accessibilityRole="header" style={typography.title}>
        Visitantes dentro
      </Text>
      {inside === null ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : inside.length === 0 ? (
        <Text style={styles.emptyText}>{MSG.RF10.empty}</Text>
      ) : (
        <View>
          {inside.map((visit) => (
            <View key={visit.id} style={styles.item}>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {visit.name}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  Unidad {visit.unit} · Entró {formatTime(new Date(visit.enteredAt))}
                  {visit.plate ? ` · ${visit.plate}` : ''}
                </Text>
              </View>
              <Button
                label="Registrar salida"
                accessibilityLabel={`Registrar salida de ${visit.name}`}
                variant="outline"
                loading={leaving === visit.id}
                disabled={leaving !== null && leaving !== visit.id}
                onPress={() => exit(visit)}
              />
            </View>
          ))}
        </View>
      )}

      <Text accessibilityRole="header" style={typography.title}>
        Visitantes esperados hoy
      </Text>

      {expectedVisitors.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={48} color={colors.placeholder} />
          <Text style={styles.emptyText}>No hay visitantes esperados para hoy.</Text>
        </View>
      ) : (
        expectedVisitors.map((visitor) => (
          <Card key={visitor.id} title={visitor.name}>
            <Text style={styles.muted}>
              {visitor.unit} · {visitor.time}
            </Text>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
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
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
