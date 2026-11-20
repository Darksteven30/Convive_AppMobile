// Tipos y contrato común de la administración de usuarios y unidades (RF20, propuesto). Lo cumplen
// el servicio simulado (community.mock.ts) y el de Supabase (community.supabase.ts); las pantallas
// solo conocen este contrato vía community.service.ts.

import type { Role, User } from '@/services/auth.types';

export const UNIT_NAME_MAX = 40;
export const UNIT_ADDRESS_MAX = 120;
export const PERSON_NAME_MIN = 3;
export const PERSON_NAME_MAX = 80;
export const EMAIL_MAX = 100;

/** Roles que deben tener una unidad asignada; administración y vigilancia pueden no tenerla. */
export const ROLES_WITH_UNIT: Role[] = ['residente', 'junta_directiva'];

/** Unidad del conjunto («56», «Torre 2 · 301», «Administración»). */
export type CommunityUnit = {
  id: string;
  name: string;
  address: string | null;
  /** Personas que tienen esta unidad asignada. */
  people: number;
};

export type UnitInput = {
  name: string;
  /** Opcional. */
  address: string;
};

/** Persona del conjunto registrada por la administración. */
export type Person = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  unitId: string | null;
  unit: string | null;
  /** Ya creó su contraseña (RF01); si no, está pre-registrada. */
  hasAccount: boolean;
};

export type PersonInput = {
  name: string;
  email: string;
  /** Opcional. */
  phone: string;
  role: Role | null;
  unitId: string | null;
};

export type UnitField = 'name' | 'address';
export type UnitErrors = Partial<Record<UnitField, string>>;
export type PersonField = 'name' | 'email' | 'phone' | 'role' | 'unitId';
export type PersonErrors = Partial<Record<PersonField, string>>;

export class CommunityError extends Error {
  constructor(
    /**
     * not_found: no existe o es de otro conjunto. has_account: ya creó su cuenta y no se puede
     * eliminar.
     */
    public readonly code: 'forbidden' | 'validation' | 'not_found' | 'has_account',
    public readonly fieldErrors: UnitErrors & PersonErrors = {},
  ) {
    super(code);
    this.name = 'CommunityError';
  }
}

/** Funciones que debe ofrecer cada implementación. Todas son solo para el administrador. */
export type CommunityBackend = {
  /** Unidades del conjunto, ordenadas por nombre. */
  listUnits(user: User): Promise<CommunityUnit[]>;
  /** Crea (id null) o edita una unidad. Falla con CommunityError. */
  saveUnit(id: string | null, input: UnitInput, user: User): Promise<CommunityUnit>;
  /** Personas del conjunto, ordenadas por nombre. */
  listPeople(user: User): Promise<Person[]>;
  /** Pre-registra a una persona: creará su contraseña al entrar con ese correo (RF01). */
  preregisterPerson(input: PersonInput, user: User): Promise<Person>;
  /** Edita a una persona. Falla con CommunityError. */
  updatePerson(id: string, input: PersonInput, user: User): Promise<Person>;
  /** Elimina un pre-registro; falla con CommunityError('has_account') si ya creó su cuenta. */
  deletePreregistration(id: string, user: User): Promise<void>;
};

/** Orden alfabético en español (tildes y mayúsculas no cambian el orden). */
export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
