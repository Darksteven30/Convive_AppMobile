import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { colors, radius, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';

type LeftAction = 'menu' | 'cancel' | 'back' | 'none';

type Props = {
  title?: string;
  left?: LeftAction;
  showAvatar?: boolean;
  onMenuPress?: () => void;
  /** Acción de «Cancelar»; por defecto vuelve a Inicio (flujo de pago). */
  onCancel?: () => void;
};

export function AppHeader({
  title = 'Convive',
  left = 'menu',
  showAvatar = true,
  onMenuPress,
  onCancel = () => router.dismissTo('/inicio'),
}: Props) {
  const { user } = useSession();

  return (
    <View style={styles.header}>
      <View style={styles.side}>
        {left === 'menu' && (
          <Pressable accessibilityLabel="Abrir menú" onPress={onMenuPress} hitSlop={8}>
            <Ionicons name="menu" size={24} color={colors.text} />
          </Pressable>
        )}
        {left === 'back' && (
          <Pressable accessibilityLabel="Volver" onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
        )}
        {left === 'cancel' && (
          <Pressable
            accessibilityLabel="Cancelar"
            onPress={onCancel}
            style={styles.cancel}
          >
            <Ionicons name="close" size={16} color={colors.text} />
            <Text style={styles.cancelLabel}>Cancelar</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>

      <View style={[styles.side, styles.right]}>
        {showAvatar && (
          <Pressable
            accessibilityLabel="Ver perfil"
            onPress={() => router.navigate('/perfil')}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{user?.initials}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  side: {
    width: 96,
    flexDirection: 'row',
  },
  right: {
    justifyContent: 'flex-end',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  cancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  cancelLabel: {
    fontSize: 13,
    color: colors.text,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.brandDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.onPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
});
