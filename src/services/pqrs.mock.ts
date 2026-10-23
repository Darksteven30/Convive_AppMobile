// Servicio de PQRS simulado (mock) para RF07 y RF08. Se usa cuando la app no tiene configurado
// Supabase (y siempre en las pruebas). Replica las PQRS de ejemplo de supabase/seed.sql y las
// validaciones de radicar_pqrs() y cambiar_estado_pqrs() en el servidor. Las fotos se quedan en el
// dispositivo (no se suben).

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  PQRS_STATUS_LABELS,
  PqrsError,
  formatPqrsNumber,
  newestFirst,
  statusChangeMessage,
  type PqrsBackend,
  type PqrsDetail,
  type PqrsInput,
  type PqrsResponse,
  type PqrsSummary,
  type StatusChangeInput,
} from '@/services/pqrs.types';
import { validatePqrs, validateStatusChange } from '@/services/pqrs.validation';

type StoredPqrs = PqrsDetail & { ownerId: string; owner: string; unit: string | null };

/**
 * Aviso que crea el servidor (la pantalla y el envío push son RF09): a la administración al
 * radicar (RF07) y al propietario cuando cambia el estado (RF08).
 */
export type MockNotification = { recipientId: string; title: string; message: string; pqrsId: string };

/** Quienes reciben el aviso: la administración del conjunto (admin@convive.com). */
const ADMIN_IDS = ['u2'];

// PQRS de ejemplo de la casa 56 (monica@gmail.com), las mismas del bloque «RF07» de seed.sql.
const seedPqrs: StoredPqrs[] = [
  {
    id: 'pq-1',
    ownerId: 'u1',
    owner: 'Monica Galvis',
    unit: '56',
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
    owner: 'Monica Galvis',
    unit: '56',
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
    owner: 'Monica Galvis',
    unit: '56',
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
let notifications: MockNotification[] = [];
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

/** Avisos creados (solo para las pruebas). */
export function mockNotifications(): MockNotification[] {
  return [...notifications];
}

/** Avisos enviados a la administración al radicar (solo para las pruebas). */
export function mockAdminNotifications(): MockNotification[] {
  return notifications.filter((item) => ADMIN_IDS.includes(item.recipientId));
}

const toSummary = ({ id, number, type, description, status, createdAt }: StoredPqrs): PqrsSummary => ({
  id,
  number,
  type,
  description,
  status,
  createdAt,
});

/** En la vista del administrador también va quién la radicó y su unidad. */
const toAdminSummary = (item: StoredPqrs): PqrsSummary => ({ ...toSummary(item), owner: item.owner, unit: item.unit });

const isAdmin = (user: User) => user.role === 'administrador';

async function listMyPqrs(user: User): Promise<PqrsSummary[]> {
  await simulateNetwork(0.5);
  return pqrs.filter((item) => item.ownerId === user.id).map(toSummary).sort(newestFirst);
}

async function getPqrsDetail(id: string, user: User): Promise<PqrsDetail> {
  await simulateNetwork(0.5);
  const item = pqrs.find((candidate) => candidate.id === id);
  if (!item || (item.ownerId !== user.id && !isAdmin(user))) {
    throw new PqrsError('not_found');
  }
  const summary = isAdmin(user) ? toAdminSummary(item) : toSummary(item);
  return { ...summary, photos: [...item.photos], responses: [...item.responses] };
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
    owner: user.name,
    unit: user.house || null,
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

async function listConjuntoPqrs(user: User): Promise<PqrsSummary[]> {
  await simulateNetwork(0.5);
  if (!isAdmin(user)) {
    throw new PqrsError('forbidden');
  }
  return pqrs.map(toAdminSummary).sort(newestFirst);
}

async function changePqrsStatus(input: StatusChangeInput, user: User): Promise<PqrsResponse> {
  await simulateNetwork();
  if (!isAdmin(user)) {
    throw new PqrsError('forbidden');
  }
  const item = pqrs.find((candidate) => candidate.id === input.pqrsId);
  if (!item) {
    throw new PqrsError('not_found');
  }
  // Se valida contra el estado guardado: si otra persona ya lo cambió, la transición no aplica.
  const errors = validateStatusChange({ ...input, currentStatus: item.status });
  if (Object.keys(errors).length > 0) {
    throw new PqrsError('validation', errors);
  }

  const response: PqrsResponse = {
    id: `r-new-${nextId++}`,
    author: user.name,
    message: input.comment.trim() || statusChangeMessage(input.status),
    status: input.status,
    createdAt: new Date().toISOString(),
  };
  pqrs = pqrs.map((candidate) =>
    candidate.id === item.id
      ? { ...candidate, status: input.status, responses: [...candidate.responses, response] }
      : candidate,
  );
  notifications = [
    ...notifications,
    {
      recipientId: item.ownerId,
      title: 'Tu PQRS cambió de estado',
      message: `Tu solicitud ${formatPqrsNumber(item.number)} ahora está «${PQRS_STATUS_LABELS[input.status]}».`,
      pqrsId: item.id,
    },
  ];
  return response;
}

export const pqrsBackend = {
  listMyPqrs,
  getPqrsDetail,
  createPqrs,
  listConjuntoPqrs,
  changePqrsStatus,
} satisfies PqrsBackend;
