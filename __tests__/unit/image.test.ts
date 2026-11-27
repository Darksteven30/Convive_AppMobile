import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { PHOTO_MAX_SIDE, PHOTO_QUALITY, compressPhoto } from '@/services/image';

// expo-image-manipulator es un módulo nativo: se simula su API contextual
// (manipulate → resize → renderAsync → saveAsync).
const mockResize = jest.fn();
const mockSave = jest.fn(async (_options: unknown) => ({ uri: 'file:///cache/comprimida.jpg', width: 1600, height: 1200 }));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
  ImageManipulator: {
    manipulate: jest.fn(() => ({
      resize: mockResize,
      renderAsync: async () => ({ saveAsync: mockSave }),
    })),
  },
}));

beforeEach(() => jest.clearAllMocks());

describe('compresión de fotos (RF07)', () => {
  it('reduce el lado más largo a 1600 px y guarda en JPEG al 70 %', async () => {
    const result = await compressPhoto({ uri: 'file:///foto.png', width: 4000, height: 3000 });

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file:///foto.png');
    expect(mockResize).toHaveBeenCalledWith({ width: PHOTO_MAX_SIDE, height: null });
    expect(mockSave).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    expect(result).toEqual({ uri: 'file:///cache/comprimida.jpg', mimeType: 'image/jpeg' });
  });

  it('en fotos verticales reduce el alto', async () => {
    await compressPhoto({ uri: 'file:///vertical.jpg', width: 3000, height: 4000 });

    expect(mockResize).toHaveBeenCalledWith({ width: null, height: PHOTO_MAX_SIDE });
  });

  it('no agranda fotos pequeñas ni las que no informan medidas, solo las comprime', async () => {
    await compressPhoto({ uri: 'file:///pequena.jpg', width: 800, height: 600 });
    await compressPhoto({ uri: 'file:///sin-medidas.jpg' });

    expect(mockResize).not.toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(2);
  });
});
