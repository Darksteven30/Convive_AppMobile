import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Calendar } from '@/components/ui/Calendar';
import { PickerModal } from '@/components/ui/PickerModal';
import { colors, radius, spacing } from '@/constants/theme';
import { formatDate, fromISODate, toISODate } from '@/utils/date';

type Props = {
  label: string;
  /** Fecha «aaaa-mm-dd». */
  value: string;
  onChange: (value: string) => void;
  /** Última fecha que se puede elegir («aaaa-mm-dd»); las posteriores se muestran en gris. */
  maxDate?: string;
  error?: string | null;
};

/** Campo de fecha dd/mm/aaaa que abre el calendario en modo de un solo día. */
export function DateField({ label, value, onChange, maxDate, error }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: formatDate(value) }}
        onPress={() => setOpen(true)}
        style={[styles.box, error ? styles.boxError : null]}
      >
        <Text style={styles.value}>{formatDate(value)}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <PickerModal visible={open} title={label} onClose={() => setOpen(false)}>
        <Calendar
          mode="single"
          value={{ start: fromISODate(value), end: null }}
          isDateDisabled={maxDate ? (date) => toISODate(date) > maxDate : undefined}
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
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
