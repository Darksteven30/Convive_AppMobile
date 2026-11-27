// Administración de usuarios y unidades simulada (mock) para RF20. Se usa cuando la app no tiene
// configurado Supabase (y siempre en las pruebas). Replica las unidades y personas de ejemplo de
// supabase/seed.sql y las reglas de guardar_unidad(), preregistrar_usuario(), editar_usuario() y
// eliminar_preregistro() en el servidor. Las personas pre-registradas aquí no se agregan al inicio de
// sesión simulado (auth.mock.ts).

import type { User } from '@/services/auth.types';
import {
  CommunityError,
  byName,
  type CommunityBackend,
  type CommunityUnit,
  type Person,
  type PersonInput,
  type UnitInput,
} from '@/services/community.types';
import { normalizePerson, normalizeUnit, validatePerson, validateUnit } from '@/services/community.validation';
import { MSG } from '@/constants/messages';
import { simulateNetwork } from '@/services/mockNetwork';

type MockUnit = Omit<CommunityUnit, 'people'>;

// Las mismas unidades del conjunto de ejemplo (seed.sql y visitors.mock.ts).
const seedUnits: MockUnit[] = [
  { id: 'unidad-12', name: '12', address: 'Casa # 12 Cali - Valle' },
  { id: 'unidad-56', name: '56', address: 'Casa # 56 Cali - Valle' },
  { id: 'unidad-78', name: '78', address: 'Casa # 78 Cali - Valle' },
  { id: 'unidad-admin', name: 'Administración', address: 'Oficina de administración' },
  { id: 'unidad-porteria', name: 'Portería', address: 'Portería principal' },
];

// Las mismas cuentas del inicio de sesión simulado (auth.mock.ts); Laura Gómez aún no crea su cuenta.
const seedPeople: Omit<Person, 'unit'>[] = [
  { id: 'u1', name: 'Monica Galvis', email: 'monica@gmail.com', phone: '3111234567', role: 'residente', unitId: 'unidad-56', hasAccount: true },
  { id: 'u2', name: 'David Muñoz', email: 'admin@convive.com', phone: '3007654321', role: 'administrador', unitId: 'unidad-admin', hasAccount: true },
  { id: 'u3', name: 'Carlos Rojas', email: 'junta@convive.com', phone: '3152223344', role: 'junta_directiva', unitId: 'unidad-12', hasAccount: true },
  { id: 'u4', name: 'Jorge Pérez', email: 'vigilancia@convive.com', phone: '3185556677', role: 'vigilancia', unitId: 'unidad-porteria', hasAccount: true },
  { id: 'u5', name: 'Laura Gómez', email: 'nuevo@convive.com', phone: '3129876543', role: 'residente', unitId: 'unidad-78', hasAccount: false },
];

let units: MockUnit[] = [];
let people: Omit<Person, 'unit'>[] = [];
let nextId = 1;

/** Nombres de las unidades del conjunto simulado (los usa el Panel del administrador). */
export function mockUnitNames(): string[] {
  return units.map((unit) => unit.name);
}

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockCommunityState() {
  units = seedUnits.map((unit) => ({ ...unit }));
  people = seedPeople.map((person) => ({ ...person }));
  nextId = 1;
}
resetMockCommunityState();

function assertAdmin(user: User) {
  if (user.role !== 'administrador') {
    throw new CommunityError('forbidden');
  }
}

const withPeople = (unit: MockUnit): CommunityUnit => ({
  ...unit,
  people: people.filter((person) => person.unitId === unit.id).length,
});

const withUnit = (person: Omit<Person, 'unit'>): Person => ({
  ...person,
  unit: units.find((unit) => unit.id === person.unitId)?.name ?? null,
});

function findPerson(id: string) {
  const person = people.find((candidate) => candidate.id === id);
  if (!person) throw new CommunityError('not_found');
  return person;
}

/** Reglas comunes de pre-registro y edición; devuelve los datos normalizados. */
function checkPerson(input: PersonInput) {
  const errors = validatePerson(input);
  if (input.unitId && !units.some((unit) => unit.id === input.unitId)) {
    errors.unitId = MSG.RF20.unitRequired;
  }
  if (Object.keys(errors).length > 0) {
    throw new CommunityError('validation', errors);
  }
  return normalizePerson(input);
}

async function listUnits(user: User): Promise<CommunityUnit[]> {
  await simulateNetwork(0.5);
  assertAdmin(user);
  return units.map(withPeople).sort(byName);
}

async function saveUnit(id: string | null, input: UnitInput, user: User): Promise<CommunityUnit> {
  await simulateNetwork();
  assertAdmin(user);
  const errors = validateUnit(input);
  if (Object.keys(errors).length > 0) {
    throw new CommunityError('validation', errors);
  }
  const { name, address } = normalizeUnit(input);
  if (units.some((unit) => unit.id !== id && unit.name.toLowerCase() === name.toLowerCase())) {
    throw new CommunityError('validation', { name: MSG.RF20.unitDuplicate });
  }
  if (id === null) {
    const unit: MockUnit = { id: `unidad-nueva-${nextId++}`, name, address };
    units = [...units, unit];
    return withPeople(unit);
  }
  if (!units.some((unit) => unit.id === id)) {
    throw new CommunityError('not_found');
  }
  units = units.map((unit) => (unit.id === id ? { ...unit, name, address } : unit));
  return withPeople(units.find((unit) => unit.id === id) as MockUnit);
}

async function listPeople(user: User): Promise<Person[]> {
  await simulateNetwork(0.5);
  assertAdmin(user);
  return people.map(withUnit).sort(byName);
}

async function preregisterPerson(input: PersonInput, user: User): Promise<Person> {
  await simulateNetwork();
  assertAdmin(user);
  const data = checkPerson(input);
  if (people.some((person) => person.email === data.email)) {
    throw new CommunityError('validation', { email: MSG.RF20.emailDuplicate });
  }
  const person = { id: `persona-nueva-${nextId++}`, ...data, role: data.role!, hasAccount: false };
  people = [...people, person];
  return withUnit(person);
}

async function updatePerson(id: string, input: PersonInput, user: User): Promise<Person> {
  await simulateNetwork();
  assertAdmin(user);
  const current = findPerson(id);
  const data = checkPerson(input);
  if (data.email !== current.email) {
    if (current.hasAccount) throw new CommunityError('validation', { email: MSG.RF20.emailLocked });
    if (people.some((person) => person.email === data.email)) {
      throw new CommunityError('validation', { email: MSG.RF20.emailDuplicate });
    }
  }
  if (data.role !== current.role) {
    if (current.id === user.id) throw new CommunityError('validation', { role: MSG.RF20.ownRole });
    const otherAdmins = people.filter((person) => person.role === 'administrador' && person.id !== id);
    if (current.role === 'administrador' && otherAdmins.length === 0) {
      throw new CommunityError('validation', { role: MSG.RF20.lastAdmin });
    }
  }
  const updated = { ...current, ...data, role: data.role! };
  people = people.map((person) => (person.id === id ? updated : person));
  return withUnit(updated);
}

async function deletePreregistration(id: string, user: User): Promise<void> {
  await simulateNetwork();
  assertAdmin(user);
  if (findPerson(id).hasAccount) {
    throw new CommunityError('has_account');
  }
  people = people.filter((person) => person.id !== id);
}

export const communityBackend = {
  listUnits,
  saveUnit,
  listPeople,
  preregisterPerson,
  updatePerson,
  deletePreregistration,
} satisfies CommunityBackend;
