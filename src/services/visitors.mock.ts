// Registro de visitantes simulado (mock) para RF10. Se usa cuando la app no tiene configurado
// Supabase (y siempre en las pruebas). Replica las unidades y las visitas de ejemplo de
// supabase/seed.sql y las validaciones de registrar_entrada_visitante() y
// registrar_salida_visitante() en el servidor.

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  VisitorError,
  newestFirst,
  type DocumentType,
  type EntryInput,
  type Unit,
  type Visit,
  type VisitorsBackend,
} from '@/services/visitors.types';
import { normalizeDocument, normalizeName, normalizePlate, validateEntry } from '@/services/visitors.validation';

/** Unidades del conjunto de ejemplo (las mismas de seed.sql). */
export const MOCK_UNITS: Unit[] = [
  { id: 'unidad-12', name: '12', address: 'Casa # 12 Cali - Valle' },
  { id: 'unidad-56', name: '56', address: 'Casa # 56 Cali - Valle' },
  { id: 'unidad-78', name: '78', address: 'Casa # 78 Cali - Valle' },
  { id: 'unidad-admin', name: 'Administración', address: 'Oficina de administración' },
  { id: 'unidad-porteria', name: 'Portería', address: 'Portería principal' },
];

// Visitas de ejemplo, las mismas del bloque «RF10» de seed.sql: una que ya salió (sirve para
// autocompletar el nombre) y otra que sigue dentro.
const seedVisits: Visit[] = [
  {
    id: 'v-1',
    name: 'Ana María Restrepo',
    documentType: 'CC',
    documentNumber: '1012345678',
    unit: '56',
    plate: null,
    enteredAt: '2026-10-28T15:00:00.000Z',
    exitedAt: '2026-10-28T17:30:00.000Z',
  },
  {
    id: 'v-2',
    name: 'Carlos Mejía',
    documentType: 'CC',
    documentNumber: '79876543',
    unit: '12',
    plate: 'ABC123',
    enteredAt: '2026-10-29T13:20:00.000Z',
    exitedAt: null,
  },
];

let visits: Visit[] = [];
let nextId = 1;

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockVisitorsState() {
  visits = seedVisits.map((visit) => ({ ...visit }));
  nextId = 1;
}
resetMockVisitorsState();

const isGuard = (user: User) => user.role === 'vigilancia';

function assertGuard(user: User) {
  if (!isGuard(user)) {
    throw new VisitorError('forbidden');
  }
}

const sameDocument = (visit: Visit, type: DocumentType, number: string) =>
  visit.documentType === type && visit.documentNumber === number;

async function listUnits(user: User): Promise<Unit[]> {
  await simulateNetwork(0.5);
  assertGuard(user);
  return MOCK_UNITS.map((unit) => ({ ...unit }));
}

async function findVisitorName(documentType: DocumentType, documentNumber: string, user: User): Promise<string | null> {
  await simulateNetwork(0.3);
  assertGuard(user);
  const number = normalizeDocument(documentNumber);
  const latest = visits.filter((visit) => sameDocument(visit, documentType, number)).sort(newestFirst)[0];
  return latest?.name ?? null;
}

async function listVisitorsInside(user: User): Promise<Visit[]> {
  await simulateNetwork(0.5);
  assertGuard(user);
  return visits.filter((visit) => visit.exitedAt === null).sort(newestFirst).map((visit) => ({ ...visit }));
}

async function registerEntry(input: EntryInput, user: User): Promise<Visit> {
  await simulateNetwork();
  assertGuard(user);
  const errors = validateEntry(input);
  if (Object.keys(errors).length > 0) {
    throw new VisitorError('validation', errors);
  }
  const unit = MOCK_UNITS.find((candidate) => candidate.id === input.unitId);
  if (!unit) {
    throw new VisitorError('validation', { unitId: MSG.RF10.unitRequired });
  }
  const documentNumber = normalizeDocument(input.documentNumber);
  if (visits.some((visit) => visit.exitedAt === null && sameDocument(visit, input.documentType, documentNumber))) {
    throw new VisitorError('validation', { documentNumber: MSG.RF10.alreadyInside });
  }

  const plate = normalizePlate(input.plate);
  const visit: Visit = {
    id: `v-new-${nextId++}`,
    name: normalizeName(input.name),
    documentType: input.documentType,
    documentNumber,
    unit: unit.name,
    plate: plate || null,
    // La hora la pone el «servidor», no la app.
    enteredAt: new Date().toISOString(),
    exitedAt: null,
  };
  visits = [...visits, visit];
  return { ...visit };
}

async function registerExit(visitId: string, user: User): Promise<Visit & { exitedAt: string }> {
  await simulateNetwork();
  assertGuard(user);
  const visit = visits.find((candidate) => candidate.id === visitId);
  if (!visit || visit.exitedAt !== null) {
    throw new VisitorError('no_active_entry');
  }
  const updated = { ...visit, exitedAt: new Date().toISOString() };
  visits = visits.map((candidate) => (candidate.id === visitId ? updated : candidate));
  return { ...updated };
}

export const visitorsBackend = {
  listUnits,
  findVisitorName,
  listVisitorsInside,
  registerEntry,
  registerExit,
} satisfies VisitorsBackend;
