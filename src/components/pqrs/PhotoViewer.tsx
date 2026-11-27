import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, spacing } from '@/constants/theme';
import type { Photo } from '@/services/pqrs.service';

type Props = {
  photos: Photo[];
  /** Posición de la foto abierta; null = cerrado. */
  index: number | null;
  onChange: (index: number | null) => void;
};

/** Foto de la PQRS en pantalla completa, con flechas para pasar entre varias y ✕ para cerrar. */
export function PhotoViewer({ photos, index, onChange }: Props) {
  const photo = index === null ? null : photos[index];
  const close = () => onChange(null);

  return (
    <Modal visible={photo != null} transparent animationType="fade" onRequestClose={close}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.counter}>
            {index !== null ? `Foto ${index + 1} de ${photos.length}` : ''}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar foto" onPress={close} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.onPrimary} />
          </Pressable>
        </View>

        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={`Foto ${(index ?? 0) + 1} ampliada`}
          />
        ) : null}

        {photos.length > 1 && index !== null ? (
          <View style={styles.nav}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto anterior"
              accessibilityState={{ disabled: index === 0 }}
              disabled={index === 0}
              onPress={() => onChange(index - 1)}
              hitSlop={12}
            >
              <Ionicons name="chevron-back" size={32} color={index === 0 ? colors.textMuted : colors.onPrimary} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Foto siguiente"
              accessibilityState={{ disabled: index === photos.length - 1 }}
              disabled={index === photos.length - 1}
              onPress={() => onChange(index + 1)}
              hitSlop={12}
            >
              <Ionicons
                name="chevron-forward"
                size={32}
                color={index === photos.length - 1 ? colors.textMuted : colors.onPrimary}
              />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.photoViewer,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  counter: {
    fontSize: 14,
    color: colors.onPrimary,
  },
  image: {
    flex: 1,
    width: '100%',
  },
  nav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
});
