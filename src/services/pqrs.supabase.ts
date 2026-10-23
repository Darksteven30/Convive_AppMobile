// PQRS con Supabase (RF07 y RF08). Cumple el mismo contrato que el servicio simulado (pqrs.types.ts).
// El esquema y las funciones están en supabase/migrations/20261022000000_pqrs.sql: las fotos se
// comprimen y se suben al bucket privado «pqrs-fotos» y radicar_pqrs() valida, asigna el radicado
// y avisa a la administración. En 20261023000000_cambio_estado_pqrs.sql, pqrs_conjunto() y
// cambiar_estado_pqrs() atienden las PQRS desde la administración (RF08).
// El conjunto y el usuario salen de la sesión (auth.uid()).

import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import { compressPhoto } from '@/services/image';
import {
  PQRS_STATUS_LABELS,
  PqrsError,
  type Photo,
  type PqrsBackend,
  type PqrsDetail,
  type PqrsErrors,
  type PqrsInput,
  type PqrsResponse,
  type PqrsStatus,
  type PqrsSummary,
  type PqrsType,
  type StatusChangeInput,
} from '@/services/pqrs.types';
import { validatePqrs, validateStatusChange } from '@/services/pqrs.validation';

/** Bucket privado de las fotos; cada conjunto tiene su carpeta. */
export const PHOTOS_BUCKET = 'pqrs-fotos';
/** Las URL firmadas para ver las fotos duran 1 hora. */
const SIGNED_URL_SECONDS = 60 * 60;

/** Fila que devuelven mis_pqrs() y radicar_pqrs(). */
type SummaryRow = {
  id: string;
  radicado: number;
  tipo?: PqrsType;
  descripcion?: string;
  estado: PqrsStatus;
  created_at: string;
  /** RF08: solo en pqrs_conjunto() y en detalle_pqrs() para el administrador. */
  radicado_por?: string | null;
  unidad?: string | null;
};

/** Fila que devuelve cambiar_estado_pqrs(). */
type ResponseRow = { id: string; autor: string; mensaje: string; estado: PqrsStatus; created_at: string };

/** JSON que devuelve detalle_pqrs(). */
type DetailRow = Required<SummaryRow> & {
  fotos: { ruta: string; tipo: string; bytes: number }[];
  respuestas: { id: string; autor: string; mensaje: string; estado: PqrsStatus; created_at: string }[];
};

type RpcError = { message?: string };

const toSummary = (row: Required<SummaryRow>): PqrsSummary => ({
  id: row.id,
  number: row.radicado,
  type: row.tipo,
  description: row.descripcion,
  status: row.estado,
  createdAt: row.created_at,
  ...(row.radicado_por ? { owner: row.radicado_por, unit: row.unidad ?? null } : {}),
});

const toResponse = (row: ResponseRow): PqrsResponse => ({
  id: row.id,
  author: row.autor,
  message: row.mensaje,
  status: row.estado,
  createdAt: row.created_at,
});

/** Traduce los errores de cambiar_estado_pqrs() (RF08). */
function toStatusError(error: RpcError & { details?: string | null }): PqrsError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new PqrsError('forbidden');
  if (message.includes('no_encontrada')) return new PqrsError('not_found');
  if (message.includes('transicion_invalida')) {
    // El detalle trae «actual|nuevo», p. ej. «resuelto|en_proceso».
    const [current, next] = (error.details ?? '').split('|') as [PqrsStatus, PqrsStatus];
    const label = (status: PqrsStatus) => PQRS_STATUS_LABELS[status] ?? '—';
    return new PqrsError('validation', { status: MSG.RF08.invalidTransition(label(current), label(next)) });
  }
  if (message.includes('comentario_obligatorio')) return new PqrsError('validation', { comment: MSG.RF08.commentRequired });
  if (message.includes('comentario_invalido')) return new PqrsError('validation', { comment: MSG.RF08.commentLength });
  return null;
}

/** Traduce los errores de radicar_pqrs() al mensaje del campo correspondiente. */
function toPqrsError(error: RpcError): PqrsError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new PqrsError('forbidden');
  const fields: [string, keyof PqrsErrors, string][] = [
    ['tipo_invalido', 'type', MSG.RF07.typeRequired],
    ['descripcion_invalida', 'description', MSG.RF07.descriptionShort],
    ['formato_invalido', 'photos', MSG.RF07.invalidFormat],
    ['foto_grande', 'photos', MSG.RF07.tooLarge],
    ['demasiadas_fotos', 'photos', MSG.RF07.tooManyPhotos],
    ['foto_obligatoria', 'photos', MSG.RF07.photoRequired],
  ];
  const match = fields.find(([code]) => message.includes(code));
  return match ? new PqrsError('validation', { [match[1]]: match[2] }) : null;
}

/** Bytes de la foto: en el celular con expo-file-system y en web con fetch (blob:/data:). */
async function readPhoto(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    return (await fetch(uri)).arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

/** «{conjunto}/{fecha}-{aleatorio}.jpg»: único y sin datos personales en el nombre. */
function photoPath(conjuntoId: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${conjuntoId}/${Date.now()}-${random}.jpg`;
}

/** Comprime y sube las fotos a la carpeta del conjunto; devuelve sus rutas en orden. */
async function uploadPhotos(photos: Photo[]): Promise<string[]> {
  if (photos.length === 0) return [];
  const supabase = getSupabase();
  const { data: conjuntoId, error: conjuntoError } = await supabase.rpc('mi_conjunto');
  if (conjuntoError || !conjuntoId) throw conjuntoError ?? new Error('sin_conjunto');

  const uploaded: string[] = [];
  try {
    for (const photo of photos) {
      const compressed = await compressPhoto(photo);
      const bytes = await readPhoto(compressed.uri);
      const path = photoPath(conjuntoId as string);
      const { error } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(path, bytes, { contentType: compressed.mimeType, upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }
  } catch (error) {
    await removePhotos(uploaded);
    throw error;
  }
  return uploaded;
}

async function removePhotos(paths: string[]) {
  if (paths.length > 0) await getSupabase().storage.from(PHOTOS_BUCKET).remove(paths);
}

async function listMyPqrs(_user: User): Promise<PqrsSummary[]> {
  const { data, error } = await getSupabase().rpc('mis_pqrs');
  if (error) throw error;
  return ((data ?? []) as Required<SummaryRow>[]).map(toSummary);
}

async function getPqrsDetail(id: string, _user: User): Promise<PqrsDetail> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('detalle_pqrs', { p_id: id });
  if (error) {
    if ((error as RpcError).message?.includes('no_encontrada')) throw new PqrsError('not_found');
    throw error;
  }
  const row = data as DetailRow;

  let photos: Photo[] = [];
  if (row.fotos.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls(row.fotos.map((foto) => foto.ruta), SIGNED_URL_SECONDS);
    if (signError) throw signError;
    photos = row.fotos.map((foto, index) => ({
      uri: signed?.[index]?.signedUrl ?? '',
      mimeType: foto.tipo,
      size: foto.bytes,
      storagePath: foto.ruta,
    }));
  }

  return {
    ...toSummary(row),
    photos,
    responses: row.respuestas.map(toResponse),
  };
}

async function createPqrs(input: PqrsInput, _user: User): Promise<PqrsSummary> {
  const errors = validatePqrs(input);
  if (Object.keys(errors).length > 0) {
    throw new PqrsError('validation', errors);
  }

  const description = input.description.trim();
  const paths = await uploadPhotos(input.photos);

  const { data, error } = await getSupabase()
    .rpc('radicar_pqrs', { p_tipo: input.type, p_descripcion: description, p_fotos: paths })
    .maybeSingle();

  if (error || !data) {
    // La PQRS no quedó radicada: las fotos subidas sobran.
    await removePhotos(paths);
    throw (error && toPqrsError(error)) ?? error ?? new Error('sin_respuesta');
  }

  const row = data as SummaryRow;
  return {
    id: row.id,
    number: row.radicado,
    type: input.type,
    description,
    status: row.estado,
    createdAt: row.created_at,
  };
}

async function listConjuntoPqrs(_user: User): Promise<PqrsSummary[]> {
  const { data, error } = await getSupabase().rpc('pqrs_conjunto');
  if (error) {
    throw toStatusError(error) ?? error;
  }
  return ((data ?? []) as Required<SummaryRow>[]).map(toSummary);
}

async function changePqrsStatus(input: StatusChangeInput, _user: User): Promise<PqrsResponse> {
  const errors = validateStatusChange(input);
  if (Object.keys(errors).length > 0) {
    throw new PqrsError('validation', errors);
  }

  const comment = input.comment.trim();
  const { data, error } = await getSupabase()
    .rpc('cambiar_estado_pqrs', { p_id: input.pqrsId, p_estado: input.status, p_comentario: comment || null })
    .maybeSingle();

  if (error || !data) {
    throw (error && toStatusError(error)) ?? error ?? new Error('sin_respuesta');
  }
  return toResponse(data as ResponseRow);
}

export const pqrsBackend = {
  listMyPqrs,
  getPqrsDetail,
  createPqrs,
  listConjuntoPqrs,
  changePqrsStatus,
} satisfies PqrsBackend;
