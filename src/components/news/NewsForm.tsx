import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/DateField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { TextLink } from '@/components/ui/TextLink';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { BODY_MAX, NewsError, TITLE_MAX, validateNews, type NewsErrors, type NewsInput } from '@/services/news.service';
import { dateAtHourISO, formatTime, toISODate, todayISO } from '@/utils/date';

type Props = {
  /** Título del encabezado: «Publicar comunicado» o «Editar comunicado». */
  title: string;
  initial?: NewsInput;
  submitLabel: string;
  /** Guarda en el servicio; si falla con NewsError, el formulario muestra el mensaje. */
  onSubmit: (input: NewsInput) => Promise<void>;
  /** Solo al editar: muestra «Eliminar comunicado». */
  onDelete?: () => void;
};

const EMPTY: NewsInput = { title: '', body: '', visibleUntil: null };

/** Horas en punto del selector «Hora»: «12:00 a. m.» a «11:00 p. m.». */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: formatTime(new Date(2000, 0, 1, hour)),
}));

/** «Visible hasta» guardado → fecha y hora del formulario (en la zona del dispositivo). */
function splitVisibleUntil(visibleUntil: string | null | undefined) {
  if (!visibleUntil) return { date: null, hour: null };
  const date = new Date(visibleUntil);
  return { date: toISODate(date), hour: String(date.getHours()) };
}

/**
 * RF19 · Formulario del comunicado (administrador): título, mensaje y, opcional, hasta cuándo se ve en
 * Inicio. Lo usan «Publicar» y «Editar». Los mensajes en línea aparecen al salir de un campo con un
 * dato inválido.
 */
export function NewsForm({ title, initial = EMPTY, submitLabel, onSubmit, onDelete }: Props) {
  const { showDialog, showToast } = useFeedback();
  const initialUntil = splitVisibleUntil(initial.visibleUntil);
  const [newsTitle, setNewsTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [untilDate, setUntilDate] = useState<string | null>(initialUntil.date);
  const [untilHour, setUntilHour] = useState<string | null>(initialUntil.hour);
  const [errors, setErrors] = useState<NewsErrors>({});
  const [saving, setSaving] = useState(false);

  const visibleUntil = untilDate && untilHour ? dateAtHourISO(untilDate, Number(untilHour)) : null;
  const draft: NewsInput = { title: newsTitle, body, visibleUntil };
  const dirty =
    newsTitle !== initial.title ||
    body !== initial.body ||
    untilDate !== initialUntil.date ||
    untilHour !== initialUntil.hour;
  const complete = newsTitle.trim() !== '' && body.trim() !== '';

  /** Reglas del servicio y, en el formulario, que la fecha tenga su hora. */
  const validate = (): NewsErrors => {
    const validation = validateNews(draft);
    if (untilDate && !untilHour) validation.visibleUntil = MSG.RF19.visibleUntilHourRequired;
    return validation;
  };

  const showFieldError = (field: keyof NewsErrors) => setErrors((current) => ({ ...current, [field]: validate()[field] }));

  const clearFieldError = (field: keyof NewsErrors) => setErrors((current) => ({ ...current, [field]: undefined }));

  const clearVisibleUntil = () => {
    setUntilDate(null);
    setUntilHour(null);
    clearFieldError('visibleUntil');
  };

  const cancel = () => {
    if (!dirty) {
      router.back();
      return;
    }
    showDialog({
      title: MSG.RF19.discardTitle,
      message: MSG.RF19.discardMessage,
      actions: [
        { label: 'Descartar', primary: true, onPress: () => router.back() },
        { label: 'Seguir editando' },
      ],
    });
  };

  const save = async () => {
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setSaving(true);
    try {
      await onSubmit(draft);
    } catch (e) {
      setSaving(false);
      if (e instanceof NewsError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF19.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof NewsError && e.code === 'validation') {
        setErrors(e.fieldErrors);
      } else if (e instanceof NewsError && e.code === 'not_found') {
        showDialog({ message: MSG.RF19.notFound, actions: [{ label: 'Aceptar', primary: true, onPress: () => router.back() }] });
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
        label="Título"
        placeholder="Ej.: Corte de agua programado"
        value={newsTitle}
        onChangeText={(value) => {
          setNewsTitle(value);
          clearFieldError('title');
        }}
        onBlur={() => newsTitle && showFieldError('title')}
        error={errors.title}
        maxLength={TITLE_MAX}
        showCounter
      />

      <TextField
        label="Mensaje"
        placeholder="Escribe el comunicado para el conjunto"
        value={body}
        onChangeText={(value) => {
          setBody(value);
          clearFieldError('body');
        }}
        onBlur={() => body && showFieldError('body')}
        error={errors.body}
        maxLength={BODY_MAX}
        showCounter
        multiline
      />

      <View style={styles.visibleUntil}>
        <Text style={styles.hint}>
          Visible hasta (opcional): después de esa fecha y hora sale de Inicio y queda en el histórico. Sin fecha, no vence.
        </Text>
        <View style={styles.row}>
          <View style={styles.cell}>
            <DateField
              label="Visible hasta"
              placeholder="Sin fecha"
              value={untilDate}
              minDate={todayISO()}
              placement="center"
              onChange={(value) => {
                setUntilDate(value);
                clearFieldError('visibleUntil');
              }}
            />
          </View>
          <View style={styles.cell}>
            <SelectField
              label="Hora"
              placeholder="Hora"
              options={HOUR_OPTIONS}
              value={untilHour}
              onChange={(value) => {
                setUntilHour(value);
                clearFieldError('visibleUntil');
              }}
              disabled={!untilDate}
              placement="center"
            />
          </View>
        </View>
        {errors.visibleUntil ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errors.visibleUntil}
          </Text>
        ) : null}
        {untilDate || untilHour ? <TextLink label="Quitar fecha" onPress={clearVisibleUntil} /> : null}
      </View>

      {onDelete ? <Button label="Eliminar comunicado" variant="outline" pill block onPress={onDelete} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  visibleUntil: {
    gap: spacing.xs,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cell: {
    flex: 1,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
