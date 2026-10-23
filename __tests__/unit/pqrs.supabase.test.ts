import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { compressPhoto } from '@/services/image';
import { PHOTOS_BUCKET, pqrsBackend as supabasePqrs } from '@/services/pqrs.supabase';
import type { PqrsInput } from '@/services/pqrs.types';

// Cliente de Supabase simulado: se verifica cómo el servicio sube las fotos y traduce las respuestas
// y los errores de la base de datos (supabase/migrations/20261022000000_pqrs.sql) al contrato de la app.
type Result = { data: unknown; error: unknown };

let rpcResults: Record<string, Result> = {};

const single = (result: Result) => ({
  data: Array.isArray(result.data) ? (result.data[0] ?? null) : result.data,
  error: result.error,
});

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  const result = rpcResults[name] ?? { data: null, error: null };
  // Como supabase-js: la llamada se puede esperar directamente o con .maybeSingle().
  return Object.assign(Promise.resolve(result), { maybeSingle: async () => single(result) });
});

const mockUpload = jest.fn(async (_path: string, _body: ArrayBuffer, _options?: unknown) => ({ data: {}, error: null as unknown }));
const mockRemove = jest.fn(async (_paths: string[]) => ({ data: [], error: null }));
const mockSignedUrls = jest.fn(async (paths: string[], _seconds: number) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://storage.test/${path}?token=abc` })),
  error: null as unknown,
}));
const mockStorageFrom = jest.fn((_bucket: string) => ({
  upload: mockUpload,
  remove: mockRemove,
  createSignedUrls: mockSignedUrls,
}));

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc, storage: { from: mockStorageFrom } }),
}));

// La compresión usa un módulo nativo: se simula y se verifica que se llame antes de subir cada foto.
jest.mock('@/services/image', () => ({
  compressPhoto: jest.fn(async (photo: { uri: string }) => ({ uri: `${photo.uri}.min.jpg`, mimeType: 'image/jpeg' })),
}));

// La foto comprimida se lee con expo-file-system (3 bytes de prueba).
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })),
}));

const resident: User = {
  id: 'p-56',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house: '56',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role: 'residente',
};

const valid: PqrsInput = {
  type: 'reporte_dano',
  description: '  La baranda de la escalera de la torre 2 está suelta.  ',
  photos: [
    { uri: 'file:///baranda.png', mimeType: 'image/png', size: 3_000_000, width: 4000, height: 3000 },
    { uri: 'file:///detalle.jpg', mimeType: 'image/jpeg', size: 1_000_000 },
  ],
};

const created = { id: 'pqrs-1', radicado: 4, estado: 'pendiente', created_at: '2026-10-22T15:00:00+00:00' };

beforeEach(() => {
  jest.clearAllMocks();
  rpcResults = { mi_conjunto: { data: 'conjunto-1', error: null } };
});

describe('PQRS con Supabase · consultar', () => {
  it('lista mis PQRS con mis_pqrs()', async () => {
    rpcResults.mis_pqrs = {
      data: [
        { id: 'a', radicado: 3, tipo: 'reporte_dano', descripcion: 'Portón dañado…', estado: 'pendiente', created_at: '2026-10-05T12:15:00+00:00' },
        { id: 'b', radicado: 2, tipo: 'queja', descripcion: 'Ruido…', estado: 'en_proceso', created_at: '2026-09-18T02:40:00+00:00' },
      ],
      error: null,
    };

    const list = await supabasePqrs.listMyPqrs(resident);

    expect(mockRpc).toHaveBeenCalledWith('mis_pqrs');
    expect(list).toEqual([
      { id: 'a', number: 3, type: 'reporte_dano', description: 'Portón dañado…', status: 'pendiente', createdAt: '2026-10-05T12:15:00+00:00' },
      { id: 'b', number: 2, type: 'queja', description: 'Ruido…', status: 'en_proceso', createdAt: '2026-09-18T02:40:00+00:00' },
    ]);
  });

  it('el detalle trae las respuestas y una URL firmada para ver cada foto', async () => {
    rpcResults.detalle_pqrs = {
      data: {
        id: 'a',
        radicado: 3,
        tipo: 'reporte_dano',
        descripcion: 'Portón dañado…',
        estado: 'en_proceso',
        created_at: '2026-10-05T12:15:00+00:00',
        fotos: [{ ruta: 'conjunto-1/1.jpg', tipo: 'image/jpeg', bytes: 250000 }],
        respuestas: [
          { id: 'r1', autor: 'David Muñoz', mensaje: 'Vamos a revisarlo.', estado: 'en_proceso', created_at: '2026-10-06T13:00:00+00:00' },
        ],
      },
      error: null,
    };

    const detail = await supabasePqrs.getPqrsDetail('a', resident);

    expect(mockRpc).toHaveBeenCalledWith('detalle_pqrs', { p_id: 'a' });
    expect(mockStorageFrom).toHaveBeenCalledWith(PHOTOS_BUCKET);
    expect(mockSignedUrls).toHaveBeenCalledWith(['conjunto-1/1.jpg'], 3600);
    expect(detail.photos).toEqual([
      {
        uri: 'https://storage.test/conjunto-1/1.jpg?token=abc',
        mimeType: 'image/jpeg',
        size: 250000,
        storagePath: 'conjunto-1/1.jpg',
      },
    ]);
    expect(detail.responses).toEqual([
      { id: 'r1', author: 'David Muñoz', message: 'Vamos a revisarlo.', status: 'en_proceso', createdAt: '2026-10-06T13:00:00+00:00' },
    ]);
  });

  it('sin fotos no pide URL firmadas', async () => {
    rpcResults.detalle_pqrs = {
      data: { id: 'a', radicado: 1, tipo: 'queja', descripcion: 'd', estado: 'pendiente', created_at: 'x', fotos: [], respuestas: [] },
      error: null,
    };

    await supabasePqrs.getPqrsDetail('a', resident);

    expect(mockSignedUrls).not.toHaveBeenCalled();
  });

  it('una PQRS ajena o inexistente → not_found', async () => {
    rpcResults.detalle_pqrs = { data: null, error: { message: 'no_encontrada' } };

    await expect(supabasePqrs.getPqrsDetail('otra', resident)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('PQRS con Supabase · radicar', () => {
  it('comprime y sube cada foto a la carpeta del conjunto y radica con sus rutas', async () => {
    rpcResults.radicar_pqrs = { data: [created], error: null };

    const result = await supabasePqrs.createPqrs(valid, resident);

    expect(compressPhoto).toHaveBeenCalledTimes(2);
    expect(compressPhoto).toHaveBeenCalledWith(valid.photos[0]);
    expect(mockUpload).toHaveBeenCalledTimes(2);
    const paths = mockUpload.mock.calls.map(([path]) => path);
    for (const path of paths) {
      expect(path).toMatch(/^conjunto-1\/\d+-[a-z0-9]+\.jpg$/);
    }
    expect(mockUpload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg', upsert: false });

    expect(mockRpc).toHaveBeenCalledWith('radicar_pqrs', {
      p_tipo: 'reporte_dano',
      p_descripcion: 'La baranda de la escalera de la torre 2 está suelta.',
      p_fotos: paths,
    });
    expect(result).toEqual({
      id: 'pqrs-1',
      number: 4,
      type: 'reporte_dano',
      description: 'La baranda de la escalera de la torre 2 está suelta.',
      status: 'pendiente',
      createdAt: '2026-10-22T15:00:00+00:00',
    });
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('sin fotos no sube nada', async () => {
    rpcResults.radicar_pqrs = { data: [created], error: null };

    await supabasePqrs.createPqrs({ ...valid, type: 'peticion', photos: [] }, resident);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('radicar_pqrs', expect.objectContaining({ p_fotos: [] }));
  });

  it('no sube fotos ni llama al servidor si los datos no son válidos', async () => {
    await expect(supabasePqrs.createPqrs({ ...valid, photos: [] }, resident)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { photos: MSG.RF07.photoRequired },
    });
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('si falla una subida, borra las que ya subió', async () => {
    mockUpload.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: {}, error: { message: 'storage caído' } });

    await expect(supabasePqrs.createPqrs(valid, resident)).rejects.toEqual({ message: 'storage caído' });

    expect(mockRemove).toHaveBeenCalledWith([mockUpload.mock.calls[0][0]]);
    expect(mockRpc).not.toHaveBeenCalledWith('radicar_pqrs', expect.anything());
  });

  it.each([
    ['tipo_invalido', 'validation', { type: MSG.RF07.typeRequired }],
    ['descripcion_invalida', 'validation', { description: MSG.RF07.descriptionShort }],
    ['formato_invalido', 'validation', { photos: MSG.RF07.invalidFormat }],
    ['foto_grande', 'validation', { photos: MSG.RF07.tooLarge }],
    ['demasiadas_fotos', 'validation', { photos: MSG.RF07.tooManyPhotos }],
    ['foto_obligatoria', 'validation', { photos: MSG.RF07.photoRequired }],
    ['sin_permiso', 'forbidden', {}],
  ])('traduce el error %s y borra las fotos subidas', async (message, code, fieldErrors) => {
    rpcResults.radicar_pqrs = { data: null, error: { message } };

    await expect(supabasePqrs.createPqrs(valid, resident)).rejects.toMatchObject({ code, fieldErrors });

    expect(mockRemove).toHaveBeenCalledWith(mockUpload.mock.calls.map(([path]) => path));
  });

  it('un error desconocido se propaga tal cual', async () => {
    const error = { message: 'connection lost' };
    rpcResults.radicar_pqrs = { data: null, error };

    await expect(supabasePqrs.createPqrs(valid, resident)).rejects.toBe(error);
  });
});
