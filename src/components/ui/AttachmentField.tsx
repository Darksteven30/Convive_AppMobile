import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { Button } from '@/components/ui/Button';
import { MSG } from '@/constants/messages';
import { colors, radius, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { ATTACHMENT_MIME_TYPES, isAllowedAttachment, type Attachment } from '@/services/finance.service';

type Props = {
  label: string;
  value: Attachment | null;
  onChange: (value: Attachment | null) => void;
  error?: string | null;
  onError: (message: string | null) => void;
};

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

function guessMimeType(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Adjuntar un soporte (PDF, JPG o PNG, máx. 5 MB) desde la cámara, la galería o los archivos. */
export function AttachmentField({ label, value, onChange, error, onError }: Props) {
  const { showDialog } = useFeedback();

  const accept = (attachment: Attachment) => {
    if (!isAllowedAttachment(attachment)) {
      onError(MSG.RF03.invalidFile);
      return;
    }
    onError(null);
    onChange(attachment);
  };

  const fromImage = (result: ImagePicker.ImagePickerResult) => {
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const name = asset.fileName ?? `soporte-${Date.now()}.jpg`;
    accept({ uri: asset.uri, name, mimeType: asset.mimeType ?? guessMimeType(name), size: asset.fileSize });
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showDialog({
        message: MSG.RF03.mediaPermissionDenied,
        actions: [
          { label: 'Ir a ajustes', primary: true, onPress: () => Linking.openSettings() },
          { label: 'Ahora no' },
        ],
      });
      return;
    }
    fromImage(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 }));
  };

  const chooseFromGallery = async () => {
    fromImage(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 }));
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ATTACHMENT_MIME_TYPES, copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    accept({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? guessMimeType(asset.name), size: asset.size });
  };

  const openOptions = () =>
    showDialog({
      title: 'Adjuntar soporte',
      message: 'PDF, JPG o PNG de máximo 5 MB.',
      actions: [
        // En web no hay cámara disponible desde el selector.
        ...(Platform.OS === 'web' ? [] : [{ label: 'Tomar foto', onPress: takePhoto }]),
        { label: 'Elegir de la galería', onPress: chooseFromGallery },
        { label: 'Seleccionar archivo', onPress: chooseFile },
        { label: 'Cancelar' },
      ],
    });

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.file}>
          <Ionicons
            name={value.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
            size={22}
            color={colors.brandDark}
          />
          <View style={styles.fileInfo}>
            <Text style={styles.fileName} numberOfLines={1}>
              {value.name}
            </Text>
            {value.size !== undefined ? <Text style={styles.fileSize}>{formatBytes(value.size)}</Text> : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quitar soporte"
            onPress={() => onChange(null)}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <Button
          label="Adjuntar soporte"
          variant="outline"
          icon={<Ionicons name="attach" size={18} color={colors.text} />}
          onPress={openOptions}
        />
      )}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
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
  file: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    color: colors.text,
  },
  fileSize: {
    fontSize: 12,
    color: colors.textMuted,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
