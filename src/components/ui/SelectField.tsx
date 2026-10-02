import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PickerModal } from '@/components/ui/PickerModal';
import { colors, radius, spacing } from '@/constants/theme';

type Option = { value: string; label: string };

type Props = {
  label: string;
  placeholder?: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  /** Se llama al cerrar la lista sin elegir nada (para mostrar el mensaje de obligatorio). */
  onDismiss?: () => void;
  error?: string | null;
  disabled?: boolean;
};

/** Lista desplegable: muestra la opción elegida y abre una hoja con las opciones. */
export function SelectField({ label, placeholder = 'Selecciona', options, value, onChange, onDismiss, error, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  const close = () => {
    setOpen(false);
    onDismiss?.();
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: selected?.label ?? placeholder }}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.box, error ? styles.boxError : null, disabled && styles.disabled]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}

      <PickerModal visible={open} title={label} onClose={close}>
        <ScrollView>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                <Text style={[styles.optionText, isSelected && styles.optionSelected]}>{option.label}</Text>
                {isSelected ? <Ionicons name="checkmark" size={18} color={colors.brandDark} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
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
  disabled: {
    opacity: 0.5,
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
  optionSelected: {
    fontWeight: '600',
    color: colors.brandDark,
  },
});
