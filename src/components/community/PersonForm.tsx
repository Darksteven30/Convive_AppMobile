import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { roleLabels } from '@/constants/permissions';
import { colors } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import type { Role } from '@/services/auth.service';
import {
  CommunityError,
  EMAIL_MAX,
  PERSON_NAME_MAX,
  ROLES_WITH_UNIT,
  listUnits,
  validatePerson,
  type CommunityUnit,
  type PersonErrors,
  type PersonInput,
} from '@/services/community.service';

type Props = {
  /** «Pre-registrar persona» o «Editar persona». */
  title: string;
  initial?: PersonInput;
  submitLabel: string;
  /** Ya creó su cuenta: el correo queda de solo lectura (también está en Supabase Auth). */
  emailLocked?: boolean;
  /** Guarda en el servicio; si falla con CommunityError, el formulario muestra el mensaje. */
  onSubmit: (input: PersonInput) => Promise<void>;
  /** Solo para pre-registros sin cuenta: muestra «Eliminar pre-registro». */
  onDelete?: () => void;
};

const EMPTY: PersonInput = { name: '', email: '', phone: '', role: null, unitId: null };
const ROLE_OPTIONS = (Object.keys(roleLabels) as Role[]).map((value) => ({ value, label: roleLabels[value] }));
/** Valor del selector para «Sin unidad» (administración y vigilancia). */
const NO_UNIT = '';

/**
 * RF20 · Formulario de la persona (administrador): nombre, correo, teléfono, rol y unidad. Lo usan
 * «Pre-registrar» y «Editar». Los mensajes en línea aparecen al salir de un campo con un dato inválido.
 */
export function PersonForm({ title, initial = EMPTY, submitLabel, emailLocked, onSubmit, onDelete }: Props) {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [units, setUnits] = useState<CommunityUnit[]>([]);
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);
  const [role, setRole] = useState<Role | null>(initial.role);
  const [unitId, setUnitId] = useState<string | null>(initial.unitId);
  const [errors, setErrors] = useState<PersonErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    listUnits(user)
      .then((items) => active && setUnits(items))
      .catch(() => active && showToast('error', MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [user, showToast]);

  const draft: PersonInput = { name, email, phone, role, unitId };
  const dirty =
    name !== initial.name ||
    email !== initial.email ||
    phone !== initial.phone ||
    role !== initial.role ||
    unitId !== initial.unitId;
  const complete = name.trim() !== '' && email.trim() !== '' && role !== null;
  const unitRequired = role !== null && ROLES_WITH_UNIT.includes(role);
  const unitOptions = [
    ...(unitRequired ? [] : [{ value: NO_UNIT, label: 'Sin unidad' }]),
    ...units.map((unit) => ({ value: unit.id, label: unit.name, description: unit.address })),
  ];

  const showFieldError = (field: keyof PersonErrors) =>
    setErrors((current) => ({ ...current, [field]: validatePerson(draft)[field] }));
  const clearFieldError = (field: keyof PersonErrors) => setErrors((current) => ({ ...current, [field]: undefined }));

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    showDialog({
      title: MSG.RF20.discardTitle,
      message: MSG.RF20.discardMessage,
      actions: [
        { label: 'Descartar', primary: true, onPress: () => router.back() },
        { label: 'Seguir editando' },
      ],
    });
  };

  const save = async () => {
    const validation = validatePerson(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (e) {
      setSaving(false);
      if (e instanceof CommunityError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF20.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof CommunityError && e.code === 'validation') {
        setErrors(e.fieldErrors);
      } else if (e instanceof CommunityError && e.code === 'not_found') {
        showDialog({ message: MSG.RF20.notFound, actions: [{ label: 'Aceptar', primary: true, onPress: () => router.back() }] });
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  return (
    <Screen
      header={<AppHeader title={title} left="cancel" showAvatar={false} onCancel={cancel} />}
      footer={<Button label={submitLabel} variant="brand" pill block disabled={!complete} loading={saving} onPress={save} />}
    >
      <TextField
        label="Nombre completo"
        placeholder="Nombres y apellidos"
        value={name}
        onChangeText={(value) => {
          setName(value);
          clearFieldError('name');
        }}
        onBlur={() => name && showFieldError('name')}
        error={errors.name}
        maxLength={PERSON_NAME_MAX}
      />
      <TextField
        label="Correo electrónico"
        placeholder="correoelectronico@dominio.com"
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          clearFieldError('email');
        }}
        onBlur={() => email && showFieldError('email')}
        error={errors.email}
        editable={!emailLocked}
        maxLength={EMAIL_MAX}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {emailLocked ? <Text style={styles.hint}>{MSG.RF20.emailLocked}</Text> : null}
      <TextField
        label="Teléfono (opcional)"
        placeholder="3001234567"
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          clearFieldError('phone');
        }}
        onBlur={() => phone && showFieldError('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        maxLength={14}
      />
      <SelectField
        label="Rol"
        placeholder="Selecciona el rol"
        options={ROLE_OPTIONS}
        value={role}
        onChange={(value) => {
          setRole(value as Role);
          clearFieldError('role');
          clearFieldError('unitId');
        }}
        error={errors.role}
        placement="center"
      />
      <SelectField
        label={unitRequired ? 'Unidad' : 'Unidad (opcional)'}
        placeholder="Selecciona la unidad"
        options={unitOptions}
        value={unitId ?? (unitRequired ? null : NO_UNIT)}
        onChange={(value) => {
          setUnitId(value === NO_UNIT ? null : value);
          clearFieldError('unitId');
        }}
        error={errors.unitId}
        placement="center"
        searchable
        emptyText="No encontramos unidades con ese nombre."
      />

      {onDelete ? <Button label="Eliminar pre-registro" variant="outline" pill block onPress={onDelete} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -8,
  },
});
