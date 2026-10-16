import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';

import { colors, layout, radius, spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** «bottom» (por defecto): hoja que sale desde abajo. «center»: ventana en el centro de la pantalla. */
  placement?: 'bottom' | 'center';
};

/** Hoja inferior (o ventana centrada) con título y botón de cerrar, usada por los selectores de lista y fecha. */
export function PickerModal({ visible, title, onClose, children, placement = 'bottom' }: Props) {
  const centered = placement === 'center';
  return (
    <Modal transparent visible={visible} animationType={centered ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[styles.overlay, centered && styles.overlayCentered]}>
        <Pressable accessibilityLabel="Cerrar" style={centered ? StyleSheet.absoluteFill : styles.backdrop} onPress={onClose} />
        <SafeAreaView edges={centered ? [] : ['bottom']} style={[styles.sheet, centered && styles.dialog]}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  overlayCentered: {
    justifyContent: 'center',
    padding: spacing.xl,
  },
  backdrop: {
    flex: 1,
  },
  dialog: {
    maxWidth: 360,
    maxHeight: '70%',
    borderRadius: radius.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    maxHeight: '80%',
    alignSelf: 'center',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
