import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { TextField } from '@/components/ui/TextField';
import { colors, spacing } from '@/constants/theme';
import { PASSWORD_MAX_LENGTH } from '@/utils/validation';

type Props = Omit<ComponentProps<typeof TextField>, 'secureTextEntry' | 'right'>;

/** Campo de contraseña con ícono para mostrar u ocultar el texto. */
export function PasswordField(props: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <TextField
      autoCapitalize="none"
      autoCorrect={false}
      maxLength={PASSWORD_MAX_LENGTH}
      {...props}
      secureTextEntry={!visible}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          onPress={() => setVisible((current) => !current)}
          hitSlop={8}
          style={styles.toggle}
        >
          <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    paddingHorizontal: spacing.md,
  },
});
