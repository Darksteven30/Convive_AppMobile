import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Calendar, type DateRange } from '@/components/ui/Calendar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  ReservationError,
  createReservation,
  formatHour,
  freeStartHours,
  getAvailability,
  isDayFull,
  lastBookableDate,
  listZones,
  validEndHours,
  validateReservation,
  type BusySlot,
  type ReservationErrors,
  type ReservationInput,
  type Zone,
} from '@/services/reservations.service';
import { formatDate, fromISODate, toISODate, todayISO } from '@/utils/date';

type Selection = { date: string | null; start: number | null; end: number | null };

const hourOptions = (hours: number[]) => hours.map((hour) => ({ value: String(hour), label: formatHour(hour) }));

/**
 * RF05 · Reserva de zonas comunes: zona, un día del calendario (desde hoy hasta 3 meses adelante),
 * franja libre de hora inicio a hora fin y asistentes opcionales. Al confirmar, el servidor vuelve
 * a verificar la disponibilidad (RF06) antes de guardar.
 */
export default function ReservasScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const now = new Date();
  const today = todayISO();
  const maxDate = lastBookableDate(today);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  // Franjas ocupadas de la zona elegida; null mientras se consultan.
  const [busy, setBusy] = useState<BusySlot[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [attendeesText, setAttendeesText] = useState('');
  const [errors, setErrors] = useState<ReservationErrors>({});
  const [saving, setSaving] = useState(false);
  // Evita que una consulta lenta de otra zona pise la de la zona elegida.
  const availabilityRequest = useRef(0);

  const zone = zones.find((item) => item.id === zoneId) ?? null;
  const attendees = attendeesText === '' ? null : Number(attendeesText);

  useEffect(() => {
    let active = true;
    listZones()
      .then((items) => active && setZones(items))
      .catch(() => active && showToast('error', MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [showToast]);

  const setFieldError = (field: keyof ReservationErrors, message?: string) =>
    setErrors((current) => ({ ...current, [field]: message }));

  const clearTime = () => {
    setStart(null);
    setEnd(null);
  };

  /**
   * Con la disponibilidad nueva, revisa lo que ya estaba elegido: si el día quedó sin cupo se
   * quita la fecha (MSG-RF05-08); si la franja ya no sirve en esta zona, se quita con su motivo.
   */
  const reconcile = (target: Zone, slots: BusySlot[], selection: Selection, count: number | null) => {
    if (selection.date && isDayFull(target, selection.date, slots)) {
      showToast('info', MSG.RF05.dayFull);
      setDate(null);
      clearTime();
    } else if (selection.date && selection.start !== null && selection.end !== null) {
      const timeError = validateReservation(
        { zoneId: target.id, date: selection.date, start: selection.start, end: selection.end, attendees: null },
        target,
        slots,
      ).time;
      if (timeError) {
        clearTime();
        setFieldError('time', timeError);
      }
    }
    setFieldError('attendees', validateReservation({ attendees: count }, target, null).attendees);
  };

  const loadAvailability = async (target: Zone, selection: Selection, count: number | null) => {
    const request = ++availabilityRequest.current;
    setBusy(null);
    try {
      const slots = await getAvailability(target.id, today, maxDate);
      if (request !== availabilityRequest.current) return;
      setBusy(slots);
      reconcile(target, slots, selection, count);
    } catch {
      if (request === availabilityRequest.current) showToast('error', MSG.general.unexpected);
    }
  };

  const selectZone = (target: Zone) => {
    if (target.id === zoneId) return;
    setZoneId(target.id);
    setErrors((current) => ({ ...current, zoneId: undefined, time: undefined }));
    loadAvailability(target, { date, start, end }, attendees);
  };

  const selectDate = (range: DateRange) => {
    if (!range.start) return;
    setDate(toISODate(range.start));
    clearTime();
    setErrors((current) => ({
      ...current,
      date: undefined,
      time: undefined,
      zoneId: zone ? undefined : MSG.RF05.zoneRequired,
    }));
  };

  const startOptions = zone && date && busy ? freeStartHours(zone, date, busy, now) : [];
  const endOptions = zone && date && busy && start !== null ? validEndHours(zone, date, start, busy) : [];

  const selectStart = (value: string) => {
    const hour = Number(value);
    setStart(hour);
    const stillValid = end !== null && zone && date && busy && validEndHours(zone, date, hour, busy).includes(end);
    if (end !== null && !stillValid) {
      setEnd(null);
      setFieldError('time', end <= hour ? MSG.RF05.endBeforeStart : undefined);
    } else {
      setFieldError('time', undefined);
    }
  };

  const selectEnd = (value: string) => {
    setEnd(Number(value));
    setFieldError('time', undefined);
  };

  const changeAttendees = (text: string) => {
    setAttendeesText(text.replace(/\D/g, '').slice(0, 4));
    setFieldError('attendees', undefined);
  };

  const resetForm = () => {
    setDate(null);
    clearTime();
    setAttendeesText('');
    setErrors({});
  };

  const save = async (input: ReservationInput, target: Zone) => {
    if (!user) return;
    setSaving(true);
    try {
      const reservation = await createReservation(input, user);
      const when = [reservation.zoneName, formatDate(input.date), formatHour(input.start), formatHour(input.end)] as const;
      if (reservation.status === 'pendiente') {
        showDialog({ message: MSG.RF05.pendingApproval, actions: [{ label: 'Aceptar', primary: true }] });
      } else {
        showToast('success', MSG.RF05.confirmed(...when));
      }
      resetForm();
      loadAvailability(target, { date: null, start: null, end: null }, null);
    } catch (e) {
      if (e instanceof ReservationError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF05.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof ReservationError && e.code === 'unavailable') {
        // Otra persona tomó la franja: se recarga la disponibilidad y se explica qué pasó.
        setErrors(e.fieldErrors);
        loadAvailability(target, input, input.attendees);
      } else if (e instanceof ReservationError) {
        setErrors(e.fieldErrors);
      } else {
        showToast('error', MSG.general.unexpected);
      }
    } finally {
      setSaving(false);
    }
  };

  const book = () => {
    const draft = { zoneId: zoneId ?? '', date: date ?? '', start: start ?? undefined, end: end ?? undefined, attendees };
    const validation = validateReservation(draft, zone, busy);
    setErrors(validation);
    if (Object.keys(validation).length > 0 || !zone || !date || start === null || end === null) return;

    const input: ReservationInput = { zoneId: zone.id, date, start, end, attendees };
    showDialog({
      title: MSG.RF05.confirmTitle,
      message: MSG.RF05.confirmMessage(zone.name, formatDate(date), formatHour(start), formatHour(end)),
      actions: [
        { label: 'Confirmar', primary: true, onPress: () => save(input, zone) },
        { label: 'Cancelar' },
      ],
    });
  };

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="reservas" />
        </>
      }
    >
      <Card title="Zona">
        <View style={styles.row}>
          {zones.map((item) => (
            <Chip key={item.id} label={item.name} selected={item.id === zoneId} onPress={() => selectZone(item)} />
          ))}
        </View>
        {errors.zoneId ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errors.zoneId}
          </Text>
        ) : null}
      </Card>

      <View style={styles.field}>
        <Calendar
          mode="single"
          value={{ start: date ? fromISODate(date) : null, end: null }}
          onChange={selectDate}
          minDate={fromISODate(today)}
          maxDate={fromISODate(maxDate)}
          isDateDisabled={(day) => !!zone && !!busy && isDayFull(zone, toISODate(day), busy, now)}
        />
        {errors.date ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errors.date}
          </Text>
        ) : null}
      </View>

      <View style={styles.field}>
        <View style={styles.pair}>
          <View style={styles.half}>
            <SelectField
              label="Hora inicio"
              placeholder="--:--"
              options={hourOptions(startOptions)}
              value={start === null ? null : String(start)}
              onChange={selectStart}
              disabled={startOptions.length === 0}
              placement="center"
            />
          </View>
          <View style={styles.half}>
            <SelectField
              label="Hora fin"
              placeholder="--:--"
              options={hourOptions(endOptions)}
              value={end === null ? null : String(end)}
              onChange={selectEnd}
              disabled={endOptions.length === 0}
              placement="center"
            />
          </View>
        </View>
        {errors.time ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {errors.time}
          </Text>
        ) : null}
      </View>

      <TextField
        label="Número de asistentes (opcional)"
        placeholder={zone ? `Máximo ${zone.capacity}` : 'Opcional'}
        value={attendeesText}
        onChangeText={changeAttendees}
        onBlur={() => setFieldError('attendees', validateReservation({ attendees }, zone, null).attendees)}
        error={errors.attendees}
        keyboardType="number-pad"
      />

      <Button
        label="Agendar reserva"
        variant="success"
        pill
        disabled={!zone || !date || start === null || end === null}
        loading={saving}
        onPress={book}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  field: {
    gap: spacing.xs,
  },
  pair: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  half: {
    flex: 1,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
