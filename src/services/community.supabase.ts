// Administración de usuarios y unidades con Supabase (RF20). Cumple el mismo contrato que el servicio
// simulado (community.types.ts). El esquema y las funciones están en
// supabase/migrations/20261120000000_usuarios_unidades.sql: todas validan que sea el administrador y
// trabajan solo con su conjunto; el correo de quien ya creó su cuenta no se cambia.

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { Role, User } from '@/services/auth.types';
import {
  CommunityError,
  type CommunityBackend,
  type CommunityUnit,
  type Person,
  type PersonErrors,
  type PersonInput,
  type UnitErrors,
  type UnitInput,
} from '@/services/community.types';
import { normalizePerson, normalizeUnit, validatePerson, validateUnit } from '@/services/community.validation';

type UnitRow = { id: string; nombre: string; direccion: string | null; personas: number };

type PersonRow = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: Role;
  unidad_id: string | null;
  unidad: string | null;
  tiene_cuenta: boolean;
};

type RpcError = { message?: string };

const toUnit = (row: UnitRow): CommunityUnit => ({
  id: row.id,
  name: row.nombre,
  address: row.direccion,
  people: row.personas,
});

const toPerson = (row: PersonRow): Person => ({
  id: row.id,
  name: row.nombre,
  email: row.email,
  phone: row.telefono,
  role: row.rol,
  unitId: row.unidad_id,
  unit: row.unidad,
  hasAccount: row.tiene_cuenta,
});

/** Traduce los errores de las funciones de RF20 al contrato de la app. */
function toCommunityError(error: RpcError): CommunityError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new CommunityError('forbidden');
  if (message.includes('no_encontrada')) return new CommunityError('not_found');
  if (message.includes('usuario_con_cuenta')) return new CommunityError('has_account');
  const fields: [string, keyof (UnitErrors & PersonErrors), string][] = [
    ['nombre_unidad_invalido', 'name', MSG.RF20.unitNameInvalid],
    ['direccion_invalida', 'address', MSG.RF20.unitAddressInvalid],
    ['unidad_duplicada', 'name', MSG.RF20.unitDuplicate],
    ['correo_invalido', 'email', MSG.RF20.emailInvalid],
    ['correo_duplicado', 'email', MSG.RF20.emailDuplicate],
    ['correo_bloqueado', 'email', MSG.RF20.emailLocked],
    ['nombre_invalido', 'name', MSG.RF20.personNameInvalid],
    ['telefono_invalido', 'phone', MSG.RF16.phoneInvalid],
    ['rol_invalido', 'role', MSG.RF20.roleRequired],
    ['rol_propio', 'role', MSG.RF20.ownRole],
    ['ultimo_administrador', 'role', MSG.RF20.lastAdmin],
    ['unidad_requerida', 'unitId', MSG.RF20.unitRequired],
  ];
  const match = fields.find(([code]) => message.includes(code));
  return match ? new CommunityError('validation', { [match[1]]: match[2] }) : null;
}

/** Lanza el error traducido (o el original) si la llamada falló o no devolvió datos. */
function fail(error: RpcError | null): never {
  throw (error && toCommunityError(error)) ?? error ?? new Error('sin_respuesta');
}

async function listUnits(_user: User): Promise<CommunityUnit[]> {
  const { data, error } = await getSupabase().rpc('unidades_admin');
  if (error) fail(error);
  return ((data ?? []) as UnitRow[]).map(toUnit);
}

async function saveUnit(id: string | null, input: UnitInput, _user: User): Promise<CommunityUnit> {
  const errors = validateUnit(input);
  if (Object.keys(errors).length > 0) throw new CommunityError('validation', errors);
  const { name, address } = normalizeUnit(input);
  const { data, error } = await getSupabase()
    .rpc('guardar_unidad', { p_id: id, p_nombre: name, p_direccion: address })
    .maybeSingle();
  if (error || !data) fail(error);
  return toUnit(data as UnitRow);
}

async function listPeople(_user: User): Promise<Person[]> {
  const { data, error } = await getSupabase().rpc('usuarios_conjunto');
  if (error) fail(error);
  return ((data ?? []) as PersonRow[]).map(toPerson);
}

/** Valida y arma los parámetros comunes de preregistrar_usuario() y editar_usuario(). */
function personParams(input: PersonInput) {
  const errors = validatePerson(input);
  if (Object.keys(errors).length > 0) throw new CommunityError('validation', errors);
  const person = normalizePerson(input);
  return {
    p_email: person.email,
    p_nombre: person.name,
    p_rol: person.role,
    p_unidad_id: person.unitId,
    p_telefono: person.phone,
  };
}

async function preregisterPerson(input: PersonInput, _user: User): Promise<Person> {
  const { data, error } = await getSupabase().rpc('preregistrar_usuario', personParams(input)).maybeSingle();
  if (error || !data) fail(error);
  return toPerson(data as PersonRow);
}

async function updatePerson(id: string, input: PersonInput, _user: User): Promise<Person> {
  const { data, error } = await getSupabase()
    .rpc('editar_usuario', { p_id: id, ...personParams(input) })
    .maybeSingle();
  if (error || !data) fail(error);
  return toPerson(data as PersonRow);
}

async function deletePreregistration(id: string, _user: User): Promise<void> {
  const { error } = await getSupabase().rpc('eliminar_preregistro', { p_id: id });
  if (error) fail(error);
}

export const communityBackend = {
  listUnits,
  saveUnit,
  listPeople,
  preregisterPerson,
  updatePerson,
  deletePreregistration,
} satisfies CommunityBackend;
