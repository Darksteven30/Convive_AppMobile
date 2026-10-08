import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import type { ComponentProps } from 'react';

import { MSG } from '@/constants/messages';
import { roleLabels } from '@/constants/permissions';
import { colors, radius, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { useConfirmSignOut } from '@/hooks/useConfirmSignOut';

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Item = { label: string; icon: ComponentProps<typeof Ionicons>['name']; onPress: () => void };

/** RF16 · Menú lateral del ícono ☰: Perfil, Notificaciones, Ayuda y Cerrar sesión. */
export function AppMenu({ visible, onClose }: Props) {
  const { user } = useSession();
  const { showToast } = useFeedback();
  const confirmSignOut = useConfirmSignOut();

  // Cada opción cierra primero el menú para que no quede abierto detrás de la nueva pantalla o diálogo.
  const select = (action: () => void) => () => {
    onClose();
    action();
  };

  const items: Item[] = [
    { label: 'Perfil', icon: 'person-outline', onPress: () => router.navigate('/perfil') },
    // Notificaciones (RF09) y Ayuda aún no tienen pantalla.
    { label: 'Notificaciones', icon: 'notifications-outline', onPress: () => showToast('info', MSG.general.comingSoon) },
    { label: 'Ayuda', icon: 'help-circle-outline', onPress: () => showToast('info', MSG.general.comingSoon) },
    { label: 'Cerrar sesión', icon: 'log-out-outline', onPress: confirmSignOut },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <SafeAreaView edges={['top', 'bottom']} style={styles.panel}>
          <View accessibilityRole="header" style={styles.header}>
            <Text style={styles.name}>{user?.name}</Text>
            {user ? <Text style={styles.role}>{roleLabels[user.role]}</Text> : null}
          </View>
          {items.map((item) => (
            <Pressable key={item.label} accessibilityRole="button" onPress={select(item.onPress)} style={styles.item}>
              <Ionicons name={item.icon} size={22} color={colors.text} />
              <Text style={styles.itemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
        <Pressable accessibilityLabel="Cerrar menú" style={styles.backdrop} onPress={onClose} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.overlay,
  },
  panel: {
    width: '78%',
    maxWidth: 300,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  backdrop: {
    flex: 1,
  },
  header: {
    paddingVertical: spacing.xl,
    gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  role: {
    fontSize: 13,
    color: colors.brandDark,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemLabel: {
    fontSize: 15,
    color: colors.text,
  },
});
