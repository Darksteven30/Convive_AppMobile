// Tipos y contrato común del registro de visitantes (RF10). Lo cumplen el servicio simulado
// (visitors.mock.ts) y el de Supabase (visitors.supabase.ts); las pantallas solo conocen este
// contrato vía visitors.service.ts.

import type { User } from '@/services/auth.types';

export type DocumentType = 'CC' | 'CE' | 'TI' | 'PASAPORTE';

/** Catálogo del selector «Tipo de documento», en el orden del documento. Por defecto: CC. */
export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'CC', label: 'CC' },
  { value: 'CE', label: 'CE' },
  { value: 'TI', label: 'TI' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
];

export const DEFAULT_DOCUMENT_TYPE: DocumentType = 'CC';

export const NAME_MIN = 3;
export const NAME_MAX = 80;
/** CC, CE y TI: solo números, 5 a 12 dígitos. Pasaporte: 5 a 15 letras o números. */
export const DOCUMENT_MAX: Record<DocumentType, number> = { CC: 12, CE: 12, TI: 12, PASAPORTE: 15 };
/** Carro AAA123 o moto AAA12A. */
export const PLATE_MAX = 6;

/** Unidad que puede autorizar el ingreso (selector con buscador). */
export type Unit = {
  id: string;
  /** Identificación corta: «56», «Torre 2 · 301». */
  name: string;
  /** Texto completo para buscar y mostrar: «Casa # 56 Cali - Valle». */
  address: string | null;
};

export type EntryInput = {
  name: string;
  documentType: DocumentType;
  documentNumber: string;
  unitId: string | null;
  /** Opcional. */
  plate: string;
};

/** Visita registrada: la hora de entrada (y de salida) la pone el servidor. */
export type Visit = {
  id: string;
  name: string;
  documentType: DocumentType;
  documentNumber: string;
  unit: string;
  plate: string | null;
  enteredAt: string;
  exitedAt: string | null;
};

export type VisitorField = 'name' | 'documentNumber' | 'unitId' | 'plate';
export type VisitorErrors = Partial<Record<VisitorField, string>>;

export class VisitorError extends Error {
  constructor(
    /** no_active_entry: la visita ya no tiene una entrada activa (MSG-RF10-03). */
    public readonly code: 'forbidden' | 'validation' | 'no_active_entry',
    public readonly fieldErrors: VisitorErrors = {},
  ) {
    super(code);
    this.name = 'VisitorError';
  }
}

/** Funciones que debe ofrecer cada implementación del registro de visitantes. */
export type VisitorsBackend = {
  /** Unidades del conjunto para el selector «Unidad que autoriza», ordenadas por nombre. */
  listUnits(user: User): Promise<Unit[]>;
  /** Nombre del último registro con ese documento (para autocompletar), o null si no hay. */
  findVisitorName(documentType: DocumentType, documentNumber: string, user: User): Promise<string | null>;
  /** Visitantes con una entrada activa (sin salida), del más reciente al más antiguo. */
  listVisitorsInside(user: User): Promise<Visit[]>;
  /** Guarda la entrada con la hora del servidor. Falla con VisitorError. */
  registerEntry(input: EntryInput, user: User): Promise<Visit>;
  /** Guarda la hora de salida. Falla con VisitorError('no_active_entry') si ya no está dentro. */
  registerExit(visitId: string, user: User): Promise<Visit & { exitedAt: string }>;
};

/** De la entrada más reciente a la más antigua. */
export const newestFirst = (a: Visit, b: Visit) => b.enteredAt.localeCompare(a.enteredAt);
