import { useState } from 'react';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import {
  CommunityError,
  UNIT_ADDRESS_MAX,
  UNIT_NAME_MAX,
  validateUnit,
  type UnitErrors,
  type UnitInput,
} from '@/services/community.service';

type Props = {
  /** «Nueva unidad» o «Editar unidad». */
  title: string;
  initial?: UnitInput;
  /** Guarda en el servicio; si falla con CommunityError, el formulario muestra el mensaje. */
  onSubmit: (input: UnitInput) => Promise<void>;
};

const EMPTY: UnitInput = { name: '', address: '' };

/**
 * RF20 · Formulario de la unidad (administrador): nombre («56», «Torre 2 · 301») y dirección.
 * Los mensajes en línea aparecen al salir de un campo con un dato inválido.
 */
export function UnitForm({ title, initial = EMPTY, onSubmit }: Props) {
  const { showDialog, showToast } = useFeedback();
  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address);
  const [errors, setErrors] = useState<UnitErrors>({});
  const [saving, setSaving] = useState(false);

  const draft = { name, address };
  const dirty = name !== initial.name || address !== initial.address;

  const showFieldError = (field: keyof UnitErrors) =>
    setErrors((current) => ({ ...current, [field]: validateUnit(draft)[field] }));
  const clearFieldError = (field: keyof UnitErrors) => setErrors((current) => ({ ...current, [field]: undefined }));

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
    const validation = validateUnit(draft);
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
      footer={<Button label="Guardar" variant="brand" pill block disabled={name.trim() === ''} loading={saving} onPress={save} />}
    >
      <TextField
        label="Nombre de la unidad"
        placeholder="Ej.: 56 o Torre 2 · 301"
        value={name}
        onChangeText={(value) => {
          setName(value);
          clearFieldError('name');
        }}
        onBlur={() => name && showFieldError('name')}
        error={errors.name}
        maxLength={UNIT_NAME_MAX}
      />
      <TextField
        label="Dirección (opcional)"
        placeholder="Ej.: Casa # 56 Cali - Valle"
        value={address}
        onChangeText={(value) => {
          setAddress(value);
          clearFieldError('address');
        }}
        onBlur={() => showFieldError('address')}
        error={errors.address}
        maxLength={UNIT_ADDRESS_MAX}
      />
    </Screen>
  );
}
