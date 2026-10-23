// Compresión de fotos antes de subirlas (RF07): se reducen a máx. 1600 px por lado y se guardan
// como JPEG al 70 %. Una foto de celular de 3–5 MB queda en unos cientos de KB.
// API contextual de expo-image-manipulator (SDK 57): manipulate → resize → renderAsync → saveAsync.

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_QUALITY = 0.7;

type Source = { uri: string; width?: number; height?: number };

export async function compressPhoto(photo: Source): Promise<{ uri: string; mimeType: 'image/jpeg' }> {
  const context = ImageManipulator.manipulate(photo.uri);
  const { width = 0, height = 0 } = photo;
  // Si el selector no informó las medidas (0), se deja el tamaño y solo se comprime.
  if (Math.max(width, height) > PHOTO_MAX_SIDE) {
    context.resize(width >= height ? { width: PHOTO_MAX_SIDE, height: null } : { width: null, height: PHOTO_MAX_SIDE });
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return { uri: result.uri, mimeType: 'image/jpeg' };
}
