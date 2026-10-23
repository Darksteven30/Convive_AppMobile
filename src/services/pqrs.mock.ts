// Servicio de PQRS simulado (mock) para RF07. Se usa cuando la app no tiene configurado Supabase
// (y siempre en las pruebas). Replica las PQRS de ejemplo de supabase/seed.sql y las validaciones
// de radicar_pqrs() en el servidor. Las fotos se quedan en el dispositivo (no se suben).

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  PqrsError,
  newestFirst,
  type PqrsBackend,
  type PqrsDetail,
  type PqrsInput,
  type PqrsSummary,
} from '@/services/pqrs.types';
import { validatePqrs } from '@/services/pqrs.validation';

type StoredPqrs = PqrsDetail & { ownerId: string };

/** Aviso a la administración al radicar (la pantalla de notificaciones es RF09). */
export type AdminNotification = { recipientId: string; title: string; message: string; pqrsId: string };

/** Quienes reciben el aviso: la administración del conjunto (admin@convive.com). */
const ADMIN_IDS = ['u2'];

// PQRS de ejemplo de la casa 56 (monica@gmail.com), las mismas del bloque «RF07» de seed.sql.
const seedPqrs: StoredPqrs[] = [
  {
    id: 'pq-1',
    ownerId: 'u1',
    number: 1,
    type: 'reclamo',
    description: 'Fuga de agua en el techo del parqueadero, frente a la casa 56.',
    status: 'resuelto',
    createdAt: '2026-08-20T14:10:00.000Z',
    photos: [],
    responses: [
      {
        id: 'r-1-1',
        author: 'David Muñoz',
        message: 'Recibimos tu reclamo. El plomero revisa la fuga el viernes.',
        status: 'en_proceso',
        createdAt: '2026-08-21T15:00:00.000Z',
      },
      {
        id: 'r-1-2',
        author: 'David Muñoz',
        message: 'Se cambió el tubo dañado y se selló el techo. Gracias por avisar.',
        status: 'resuelto',
        createdAt: '2026-08-23T17:30:00.000Z',
      },
    ],
  },
  {
    id: 'pq-2',
    ownerId: 'u1',
    number: 2,
    type: 'queja',
    description: 'Ruido de música después de las 11 p. m. en la torre 4 casi todos los fines de semana.',
    status: 'en_proceso',
    createdAt: '2026-09-18T02:40:00.000Z',
    photos: [],
    responses: [
      {
        id: 'r-2-1',
        author: 'David Muñoz',
        message: 'Enviamos un llamado de atención a la unidad y la vigilancia hará rondas los sábados.',
        status: 'en_proceso',
        createdAt: '2026-09-19T13:00:00.000Z',
      },
    ],
  },
  {
    id: 'pq-3',
    ownerId: 'u1',
    number: 3,
    type: 'reporte_dano',
    description: 'El portón vehicular no cierra completamente y queda abierto unos centímetros.',
    status: 'pendiente',
    createdAt: '2026-10-05T12:15:00.000Z',
    photos: [],
    responses: [],
  },
];

let pqrs: StoredPqrs[] = [];
let notifications: AdminNotification[] = [];
let nextNumber = 4;
let nextId = 1;

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockPqrsState() {
  pqrs = seedPqrs.map((item) => ({ ...item, photos: [...item.photos], responses: [...item.responses] }));
  notifications = [];
  nextNumber = 4;
  nextId = 1;
}
resetMockPqrsState();

/** Avisos enviados a la administración (solo para las pruebas). */
export function mockAdminNotifications(): AdminNotification[] {
  return [...notifications];
}

const toSummary = ({ id, number, type, description, status, createdAt }: StoredPqrs): PqrsSummary => ({
  id,
  number,
  type,
  description,
  status,
  createdAt,
});

async function listMyPqrs(user: User): Promise<PqrsSummary[]> {
  await simulateNetwork(0.5);
  return pqrs.filter((item) => item.ownerId === user.id).map(toSummary).sort(newestFirst);
}

async function getPqrsDetail(id: string, user: User): Promise<PqrsDetail> {
  await simulateNetwork(0.5);
  const item = pqrs.find((candidate) => candidate.id === id);
  if (!item || (item.ownerId !== user.id && user.role !== 'administrador')) {
    throw new PqrsError('not_found');
  }
  return { ...toSummary(item), photos: [...item.photos], responses: [...item.responses] };
}

async function createPqrs(input: PqrsInput, user: User): Promise<PqrsSummary> {
  await simulateNetwork();
  const errors = validatePqrs(input);
  if (Object.keys(errors).length > 0) {
    throw new PqrsError('validation', errors);
  }
  const item: StoredPqrs = {
    id: `pq-new-${nextId++}`,
    ownerId: user.id,
    number: nextNumber++,
    type: input.type,
    description: input.description.trim(),
    status: 'pendiente',
    createdAt: new Date().toISOString(),
    photos: input.photos.map((photo) => ({ ...photo })),
    responses: [],
  };
  pqrs = [...pqrs, item];
  notifications = [
    ...notifications,
    ...ADMIN_IDS.map((recipientId) => ({
      recipientId,
      title: 'Nueva PQRS',
      message: `${user.name} radicó la solicitud #${String(item.number).padStart(4, '0')}.`,
      pqrsId: item.id,
    })),
  ];
  return toSummary(item);
}

export const pqrsBackend = {
  listMyPqrs,
  getPqrsDetail,
  createPqrs,
} satisfies PqrsBackend;
