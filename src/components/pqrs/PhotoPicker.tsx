import { Image, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { MSG } from '@/constants/messages';
import { colors, radius, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { PHOTO_MAX_COUNT, photoError, type Photo } from '@/services/pqrs.service';

type Props = {
  label: string;
  photos: Photo[];
  onChange: (photos: Photo[]) => void;
  error?: string | null;
  /** Mensaje en línea de la última foto rechazada (MSG-RF07-04/05), o null para quitarlo. */
  onError: (message: string | null) => void;
};

const MIME_BY_EXTENSION: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

function guessMimeType(name: string): string {
  const extension = name.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/**
 * RF07 · Fotos de la PQRS desde la cámara o la galería: JPG o PNG de máx. 5 MB, hasta 3, con
 * miniaturas y una «x» para quitar cada una. Se comprimen al radicar (antes de subirlas).
 */
export function PhotoPicker({ label, photos, onChange, error, onError }: Props) {
  const { showDialog, showToast } = useFeedback();
  const remaining = PHOTO_MAX_COUNT - photos.length;

  const askForSettings = () =>
    showDialog({
      message: MSG.RF07.permissionDenied,
      actions: [
        { label: 'Ir a ajustes', primary: true, onPress: () => Linking.openSettings() },
        { label: 'Ahora no' },
      ],
    });

  const addAssets = (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled || result.assets.length === 0) return;
    let rejected: string | null = null;
    const accepted: Photo[] = [];
    for (const asset of result.assets) {
      const photo: Photo = {
        uri: asset.uri,
        mimeType: asset.mimeType ?? guessMimeType(asset.fileName ?? asset.uri),
        size: asset.fileSize,
        width: asset.width,
        height: asset.height,
      };
      const problem = photoError(photo);
      if (problem) {
        rejected = rejected ?? problem;
      } else {
        accepted.push(photo);
      }
    }
    if (accepted.length > remaining) {
      showToast('info', MSG.RF07.tooManyPhotos);
    }
    onError(rejected);
    if (accepted.length > 0) {
      onChange([...photos, ...accepted.slice(0, remaining)]);
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      askForSettings();
      return;
    }
    addAssets(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 }));
  };

  const chooseFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      askForSettings();
      return;
    }
    addAssets(
      await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.8,
      }),
    );
  };

  const openOptions = () => {
    if (remaining <= 0) {
      showToast('info', MSG.RF07.tooManyPhotos);
      return;
    }
    showDialog({
      title: 'Adjuntar foto',
      message: `JPG o PNG de máximo 5 MB. Puedes adjuntar hasta ${PHOTO_MAX_COUNT} fotos.`,
      actions: [
        // En web no hay cámara disponible desde el selector.
        ...(Platform.OS === 'web' ? [] : [{ label: 'Tomar foto', onPress: takePhoto }]),
        { label: 'Elegir de la galería', onPress: chooseFromGallery },
        { label: 'Cancelar' },
      ],
    });
  };

  const remove = (index: number) => {
    onError(null);
    onChange(photos.filter((_, position) => position !== index));
  };

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>
        {label} ({photos.length}/{PHOTO_MAX_COUNT})
      </Text>
      <View style={styles.row}>
        {photos.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={styles.thumb}>
            <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Foto ${index + 1}`} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Quitar foto ${index + 1}`}
              onPress={() => remove(index)}
              hitSlop={8}
              style={styles.remove}
            >
              <Ionicons name="close" size={14} color={colors.onPrimary} />
            </Pressable>
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Adjuntar foto"
          onPress={openOptions}
          style={[styles.thumb, styles.add, error ? styles.addError : null]}
        >
          <Ionicons name="camera-outline" size={26} color={colors.textMuted} />
        </Pressable>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const THUMB = 72;

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
  },
  image: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addError: {
    borderColor: colors.danger,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
