import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PickerModal } from '@/components/ui/PickerModal';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';

/** «description» es un texto secundario debajo de la opción; también se usa al buscar. */
type Option = { value: string; label: string; description?: string | null };

/** Sin tildes ni mayúsculas, para buscar «administracion» y encontrar «Administración». */
const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  /** Dónde se abre la lista (ver PickerModal). */
  placement?: 'bottom' | 'center';
  /** Muestra un buscador sobre las opciones (p. ej. la unidad que autoriza, RF10). */
  searchable?: boolean;
  /** Texto cuando la búsqueda no encuentra opciones. */
  emptyText?: string;
};

/** Lista desplegable: muestra la opción elegida y abre una hoja con las opciones. */
export function SelectField({
  label,
  placeholder = 'Selecciona',
  options,
  value,
  onChange,
  onDismiss,
  error,
  disabled,
  placement,
  searchable,
  emptyText = 'No hay resultados.',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((option) => option.value === value);

  const search = normalize(query.trim());
  const visible = search
    ? options.filter((option) => normalize(`${option.label} ${option.description ?? ''}`).includes(search))
    : options;

  const openList = () => {
    setQuery('');
    setOpen(true);
  };

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
        onPress={openList}
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

      <PickerModal visible={open} title={label} onClose={close} placement={placement}>
        {searchable ? (
          <TextField
            accessibilityLabel={`Buscar ${label.toLowerCase()}`}
            placeholder="Buscar"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            right={<Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />}
          />
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled">
          {visible.length === 0 ? <Text style={styles.emptyText}>{emptyText}</Text> : null}
          {visible.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                <View style={styles.optionBody}>
                  <Text style={[styles.optionText, isSelected && styles.optionSelected]}>{option.label}</Text>
                  {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
                </View>
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
  optionBody: {
    flex: 1,
    gap: 2,
  },
  optionText: {
    fontSize: 15,
    color: colors.text,
  },
  optionDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
  searchIcon: {
    marginRight: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  optionSelected: {
    fontWeight: '600',
    color: colors.brandDark,
  },
});
