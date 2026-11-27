// Registro de visitantes con Supabase (RF10). Cumple el mismo contrato que el servicio simulado
// (visitors.types.ts). El esquema y las funciones están en
// supabase/migrations/20261030000000_visitantes.sql: registrar_entrada_visitante() valida y guarda
// la hora de entrada del servidor y registrar_salida_visitante() la de salida, solo si la visita
// sigue activa. El conjunto y el usuario salen de la sesión (auth.uid()).

import { MSG } from '@/constants/messages';
import { getSupabase } from '@/lib/supabase';
import type { User } from '@/services/auth.types';
import {
  VisitorError,
  type DocumentType,
  type EntryInput,
  type Unit,
  type Visit,
  type VisitorErrors,
  type VisitorsBackend,
} from '@/services/visitors.types';
import { normalizeDocument, normalizeName, normalizePlate, validateEntry } from '@/services/visitors.validation';

/** Fila que devuelven visitantes_dentro(), registrar_entrada_visitante() y registrar_salida_visitante(). */
type VisitRow = {
  id: string;
  nombre: string;
  tipo_documento: DocumentType;
  numero_documento: string;
  unidad: string;
  placa: string | null;
  entrada: string;
  salida: string | null;
};

type UnitRow = { id: string; nombre: string; direccion: string | null };

type RpcError = { message?: string };

const toVisit = (row: VisitRow): Visit => ({
  id: row.id,
  name: row.nombre,
  documentType: row.tipo_documento,
  documentNumber: row.numero_documento,
  unit: row.unidad,
  plate: row.placa,
  enteredAt: row.entrada,
  exitedAt: row.salida,
});

/** Traduce los errores de las funciones de RF10 al contrato de la app. */
function toVisitorError(error: RpcError): VisitorError | null {
  const message = error.message ?? '';
  if (message.includes('sin_permiso')) return new VisitorError('forbidden');
  if (message.includes('sin_entrada_activa')) return new VisitorError('no_active_entry');
  const fields: [string, keyof VisitorErrors, string][] = [
    ['nombre_invalido', 'name', MSG.RF10.nameInvalid],
    ['documento_invalido', 'documentNumber', MSG.RF10.documentInvalid],
    ['ya_dentro', 'documentNumber', MSG.RF10.alreadyInside],
    ['unidad_invalida', 'unitId', MSG.RF10.unitRequired],
    ['placa_invalida', 'plate', MSG.RF10.plateInvalid],
  ];
  const match = fields.find(([code]) => message.includes(code));
  return match ? new VisitorError('validation', { [match[1]]: match[2] }) : null;
}

async function listUnits(_user: User): Promise<Unit[]> {
  const { data, error } = await getSupabase().rpc('unidades_visita');
  if (error) throw toVisitorError(error) ?? error;
  return ((data ?? []) as UnitRow[]).map((row) => ({ id: row.id, name: row.nombre, address: row.direccion }));
}

async function findVisitorName(documentType: DocumentType, documentNumber: string, _user: User): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('buscar_visitante', {
    p_tipo_documento: documentType,
    p_numero_documento: normalizeDocument(documentNumber),
  });
  if (error) throw toVisitorError(error) ?? error;
  return (data as string | null) ?? null;
}

async function listVisitorsInside(_user: User): Promise<Visit[]> {
  const { data, error } = await getSupabase().rpc('visitantes_dentro');
  if (error) throw toVisitorError(error) ?? error;
  return ((data ?? []) as VisitRow[]).map(toVisit);
}

async function registerEntry(input: EntryInput, _user: User): Promise<Visit> {
  const errors = validateEntry(input);
  if (Object.keys(errors).length > 0) {
    throw new VisitorError('validation', errors);
  }

  const { data, error } = await getSupabase()
    .rpc('registrar_entrada_visitante', {
      p_nombre: normalizeName(input.name),
      p_tipo_documento: input.documentType,
      p_numero_documento: normalizeDocument(input.documentNumber),
      p_unidad_id: input.unitId,
      p_placa: normalizePlate(input.plate) || null,
    })
    .maybeSingle();

  if (error || !data) {
    throw (error && toVisitorError(error)) ?? error ?? new Error('sin_respuesta');
  }
  return toVisit(data as VisitRow);
}

async function registerExit(visitId: string, _user: User): Promise<Visit & { exitedAt: string }> {
  const { data, error } = await getSupabase().rpc('registrar_salida_visitante', { p_id: visitId }).maybeSingle();
  if (error || !data) {
    throw (error && toVisitorError(error)) ?? error ?? new Error('sin_respuesta');
  }
  // registrar_salida_visitante() siempre devuelve la hora de salida.
  return toVisit(data as VisitRow) as Visit & { exitedAt: string };
}

export const visitorsBackend = {
  listUnits,
  findVisitorName,
  listVisitorsInside,
  registerEntry,
  registerExit,
} satisfies VisitorsBackend;
