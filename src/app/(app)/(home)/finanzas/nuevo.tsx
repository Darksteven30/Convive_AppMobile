import { useEffect, useState } from 'react';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AttachmentField } from '@/components/ui/AttachmentField';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  DESCRIPTION_MAX,
  FinanceError,
  createMovement,
  listCategories,
  validateMovement,
  type Attachment,
  type Category,
  type MovementErrors,
  type MovementType,
} from '@/services/finance.service';
import { todayISO } from '@/utils/date';
import { formatAmountInput } from '@/utils/money';

const TYPE_OPTIONS: { value: MovementType; label: string }[] = [
  { value: 'ingreso', label: 'Ingreso' },
  { value: 'egreso', label: 'Egreso' },
];

/**
 * RF03 · Nuevo movimiento (administrador): registra un ingreso o egreso con su categoría.
 * Los mensajes en línea aparecen cuando el usuario sale de un campo con un dato inválido.
 */
export default function NuevoMovimientoScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const today = todayISO();

  const [type, setType] = useState<MovementType>('ingreso');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [errors, setErrors] = useState<MovementErrors>({});
  const [saving, setSaving] = useState(false);

  // Al cambiar el tipo se recarga la lista de categorías de ese tipo.
  useEffect(() => {
    let active = true;
    listCategories(type).then((items) => active && setCategories(items));
    return () => {
      active = false;
    };
  }, [type]);

  const draft = { type, categoryId: categoryId ?? '', amount: amount ?? 0, date, description, attachment };
  const requiredComplete = !!categoryId && amount !== null && description.trim().length > 0;
  const dirty =
    categoryId !== null || amountText !== '' || description !== '' || attachment !== null || date !== today;

  const showFieldError = (field: keyof MovementErrors) => {
    const fieldError = validateMovement(draft, today)[field];
    setErrors((current) => ({ ...current, [field]: fieldError }));
  };

  const clearFieldError = (field: keyof MovementErrors) =>
    setErrors((current) => ({ ...current, [field]: undefined }));

  const changeType = (value: MovementType) => {
    setType(value);
    setCategoryId(null);
    setCategories([]);
  };

  const changeAmount = (text: string) => {
    const formatted = formatAmountInput(text);
    setAmountText(formatted.text);
    setAmount(formatted.value);
    clearFieldError('amount');
  };

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    showDialog({
      title: MSG.RF03.discardTitle,
      message: MSG.RF03.discardMessage,
      actions: [
        { label: 'Descartar', primary: true, onPress: () => router.back() },
        { label: 'Seguir editando' },
      ],
    });
  };

  const save = async () => {
    const validation = validateMovement(draft, today);
    setErrors(validation);
    if (!user || Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await createMovement({ ...draft, categoryId: categoryId as string, amount: amount as number }, user);
      showToast('success', MSG.RF03.saved);
      router.back();
    } catch (e) {
      setSaving(false);
      if (e instanceof FinanceError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF03.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof FinanceError) {
        setErrors(e.fieldErrors);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  return (
    <Screen
      header={<AppHeader title="Nuevo movimiento" left="cancel" showAvatar={false} onCancel={cancel} />}
      footer={
        <Button
          label="Guardar"
          variant="success"
          pill
          block
          disabled={!requiredComplete}
          loading={saving}
          onPress={save}
        />
      }
    >
      <SegmentedControl label="Tipo" options={TYPE_OPTIONS} value={type} onChange={changeType} />

      <SelectField
        label="Categoría"
        placeholder="Selecciona una categoría"
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        value={categoryId}
        onChange={(value) => {
          setCategoryId(value);
          clearFieldError('categoryId');
        }}
        onDismiss={() => !categoryId && setErrors((current) => ({ ...current, categoryId: MSG.RF03.categoryRequired }))}
        error={errors.categoryId}
        disabled={categories.length === 0}
      />

      <TextField
        label="Monto"
        placeholder="$ 0"
        value={amountText}
        onChangeText={changeAmount}
        onBlur={() => amountText && showFieldError('amount')}
        error={errors.amount}
        keyboardType="decimal-pad"
      />

      <DateField
        label="Fecha"
        value={date}
        maxDate={today}
        onChange={(value) => {
          setDate(value);
          clearFieldError('date');
        }}
        error={errors.date}
      />

      <TextField
        label="Concepto / descripción"
        placeholder="Describe el movimiento"
        value={description}
        onChangeText={(value) => {
          setDescription(value);
          clearFieldError('description');
        }}
        onBlur={() => description && showFieldError('description')}
        error={errors.description}
        maxLength={DESCRIPTION_MAX}
        showCounter
        multiline
      />

      <AttachmentField
        label="Soporte (opcional)"
        value={attachment}
        onChange={setAttachment}
        error={errors.attachment}
        onError={(message) => setErrors((current) => ({ ...current, attachment: message ?? undefined }))}
      />
    </Screen>
  );
}
