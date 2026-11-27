import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Calendar } from '@/components/ui/Calendar';
import { PickerModal } from '@/components/ui/PickerModal';
import { colors, radius, spacing } from '@/constants/theme';
import { formatDate, fromISODate, toISODate } from '@/utils/date';

type Props = {
  label: string;
  /** Fecha «aaaa-mm-dd», o null si es opcional y está vacía (muestra «placeholder»). */
  value: string | null;
  onChange: (value: string) => void;
  /** Última fecha que se puede elegir («aaaa-mm-dd»); las posteriores se muestran en gris. */
  maxDate?: string;
  /** Primera fecha que se puede elegir («aaaa-mm-dd»); las anteriores se muestran en gris. */
  minDate?: string;
  placeholder?: string;
  error?: string | null;
  /** Dónde se abre el calendario (ver PickerModal). */
  placement?: 'bottom' | 'center';
};

/** Campo de fecha dd/mm/aaaa que abre el calendario en modo de un solo día. */
export function DateField({
  label,
  value,
  onChange,
  maxDate,
  minDate,
  placeholder = 'Selecciona la fecha',
  error,
  placement,
}: Props) {
  const [open, setOpen] = useState(false);
  const text = value ? formatDate(value) : placeholder;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text }}
        onPress={() => setOpen(true)}
        style={[styles.box, error ? styles.boxError : null]}
      >
        <Text style={[styles.value, !value && styles.placeholder]}>{text}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <PickerModal visible={open} title={label} onClose={() => setOpen(false)} placement={placement}>
        <Calendar
          mode="single"
          value={{ start: value ? fromISODate(value) : null, end: null }}
          isDateDisabled={
            maxDate || minDate
              ? (date) => (!!maxDate && toISODate(date) > maxDate) || (!!minDate && toISODate(date) < minDate)
              : undefined
          }
          onChange={({ start }) => {
            if (start) onChange(toISODate(start));
            setOpen(false);
          }}
        />
      </PickerModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  boxError: {
    borderColor: colors.danger,
  },
  value: {
    fontSize: 14,
    color: colors.text,
  },
  placeholder: {
    color: colors.placeholder,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
