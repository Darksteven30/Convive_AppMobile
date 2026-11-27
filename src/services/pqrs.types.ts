// Tipos y contrato común de las PQRS y reportes de daño (RF07). Lo cumplen el servicio simulado
// (pqrs.mock.ts) y el de Supabase (pqrs.supabase.ts); las pantallas solo conocen este contrato vía
// pqrs.service.ts.

import type { User } from '@/services/auth.types';

export type PqrsType = 'peticion' | 'queja' | 'reclamo' | 'sugerencia' | 'reporte_dano';
export type PqrsStatus = 'pendiente' | 'en_proceso' | 'resuelto';

/** Catálogo del campo «Tipo», en el orden del documento. */
export const PQRS_TYPES: { value: PqrsType; label: string }[] = [
  { value: 'peticion', label: 'Petición' },
  { value: 'queja', label: 'Queja' },
  { value: 'reclamo', label: 'Reclamo' },
  { value: 'sugerencia', label: 'Sugerencia' },
  { value: 'reporte_dano', label: 'Reporte de daño' },
];

export const PQRS_STATUS_LABELS: Record<PqrsStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  resuelto: 'Resuelto',
};

export const DESCRIPTION_MIN = 20;
export const DESCRIPTION_MAX = 1000;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_MAX_COUNT = 3;
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png'];

export type Photo = {
  /** Imagen local elegida en el celular o en web; en las ya radicadas, una URL firmada para verla. */
  uri: string;
  mimeType: string;
  /** Tamaño en bytes; algunos selectores no lo informan. */
  size?: number;
  /** Medidas en píxeles (para reducirla antes de subirla); pueden faltar. */
  width?: number;
  height?: number;
  /** Ruta de la foto en Supabase Storage, una vez subida. */
  storagePath?: string;
};

export type PqrsInput = {
  type: PqrsType;
  description: string;
  photos: Photo[];
};

/** PQRS de la lista: radicado, tipo, descripción y estado. */
export type PqrsSummary = {
  id: string;
  /** Radicado consecutivo del conjunto: 232 → «#0232». */
  number: number;
  type: PqrsType;
  description: string;
  status: PqrsStatus;
  createdAt: string;
  /** RF08: quién la radicó y su unidad (solo en la vista del administrador). */
  owner?: string;
  unit?: string | null;
};

/** Respuesta de la administración (o cambio de estado) en el historial de la PQRS. */
export type PqrsResponse = {
  id: string;
  author: string;
  message: string;
  /** Estado en que quedó la PQRS con esta respuesta. */
  status: PqrsStatus;
  createdAt: string;
};

export type PqrsDetail = PqrsSummary & {
  photos: Photo[];
  /** Del más antiguo al más reciente. */
  responses: PqrsResponse[];
};

// ---------------------------------------------------------------------------------------------
// RF08 · Cambio de estado (administrador)
// ---------------------------------------------------------------------------------------------

/** Flujo Pendiente → En proceso → Resuelto: cada estado solo pasa al siguiente. Resuelto es final. */
export const NEXT_STATUSES: Record<PqrsStatus, PqrsStatus[]> = {
  pendiente: ['en_proceso'],
  en_proceso: ['resuelto'],
  resuelto: [],
};

export const COMMENT_MIN = 10;
export const COMMENT_MAX = 500;

export type StatusChangeInput = {
  pqrsId: string;
  /** Estado actual que ve el administrador (para detectar cambios hechos por otra persona). */
  currentStatus: PqrsStatus;
  status: PqrsStatus;
  /** Comentario / respuesta para el propietario: obligatorio al pasar a «Resuelto». */
  comment: string;
};

export type PqrsField = 'type' | 'description' | 'photos' | 'status' | 'comment';
export type PqrsErrors = Partial<Record<PqrsField, string>>;

export class PqrsError extends Error {
  constructor(
    public readonly code: 'forbidden' | 'validation' | 'not_found',
    public readonly fieldErrors: PqrsErrors = {},
  ) {
    super(code);
    this.name = 'PqrsError';
  }
}

/** Funciones que debe ofrecer cada implementación de PQRS. */
export type PqrsBackend = {
  /** PQRS radicadas por el usuario de la sesión, de la más reciente a la más antigua. */
  listMyPqrs(user: User): Promise<PqrsSummary[]>;
  /** Detalle con fotos e historial de respuestas. Falla con PqrsError('not_found') si no es suya. */
  getPqrsDetail(id: string, user: User): Promise<PqrsDetail>;
  /** Sube las fotos, asigna el radicado, deja la PQRS «Pendiente» y avisa a la administración. */
  createPqrs(input: PqrsInput, user: User): Promise<PqrsSummary>;
  /** RF08: todas las PQRS del conjunto (solo administrador), de la más reciente a la más antigua. */
  listConjuntoPqrs(user: User): Promise<PqrsSummary[]>;
  /**
   * RF08: cambia el estado con su comentario, deja la respuesta en el historial con usuario y
   * fecha/hora y crea el aviso para el propietario (RF09). Falla con PqrsError.
   */
  changePqrsStatus(input: StatusChangeInput, user: User): Promise<PqrsResponse>;
};

/** Texto del cambio de estado cuando el administrador no escribe un comentario. */
export const statusChangeMessage = (status: PqrsStatus) => `Cambió el estado a ${PQRS_STATUS_LABELS[status]}.`;

/** 232 → «#0232». */
export const formatPqrsNumber = (number: number) => `#${String(number).padStart(4, '0')}`;

export const pqrsTypeLabel = (type: PqrsType) => PQRS_TYPES.find((item) => item.value === type)?.label ?? type;

/** De la más reciente a la más antigua. */
export const newestFirst = (a: PqrsSummary, b: PqrsSummary) =>
  b.createdAt.localeCompare(a.createdAt) || b.number - a.number;
