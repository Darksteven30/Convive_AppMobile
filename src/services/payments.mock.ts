// Servicio de pagos simulado (mock). Se usa cuando la app no tiene configurado Supabase (y siempre
// en las pruebas). Replica los datos de supabase/seed.sql (catálogo de conceptos y cartera por
// unidad) y lo que hace iniciar_pago() en el servidor: validaciones, un solo pago PENDIENTE por
// concepto, referencia única y firma. La firma es simulada: la real usa el secreto de integridad.
// RF13/RF15: la ventana de Wompi simulada «reporta» el resultado (como el API de Wompi) y
// checkPaymentStatus lo aplica con las mismas reglas que aplicar_estado_wompi(): el saldo se descuenta
// una sola vez si se aprueba y se devuelve si se anula.

import type { User } from '@/services/auth.types';
import { simulateNetwork } from '@/services/mockNetwork';
import {
  PaymentError,
  buildAccountStatus,
  toCents,
  type AccountStatus,
  type PaymentCheckout,
  type PaymentGateway,
  type PaymentInput,
  type PaymentResult,
  type PaymentStatus,
  type PaymentStatusCode,
  type PaymentsBackend,
} from '@/services/payments.types';
import { validatePaymentSelection } from '@/services/payments.validation';

const catalog = [
  { id: 'administracion', name: 'Cuota administración', requiresDescription: false },
  { id: 'extraordinaria', name: 'Cuota extraordinaria', requiresDescription: false },
  { id: 'otros', name: 'Otros conceptos', requiresDescription: true },
];

/** Saldo pendiente por unidad (User.house) y concepto. Las unidades que no aparecen están al día. */
const initialPortfolio: Record<string, Record<string, number>> = {
  '56': { administracion: 35_000, extraordinaria: 0, otros: 10_678.9 },
  '12': { administracion: 35_000 },
  '78': { administracion: 70_000 },
};

const initialGateway: PaymentGateway = {
  available: true,
  methods: ['CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA'],
};

/** Llave pública de ejemplo con el formato de Wompi Sandbox. */
const MOCK_PUBLIC_KEY = 'pub_test_convive_simulada';

export type MockTransaction = PaymentCheckout & {
  house: string;
  conceptId: string;
  description: string | null;
  amount: number;
  status: PaymentStatusCode;
  method: string | null;
  wompiId: string | null;
  /** Lo que se descontó del saldo al aprobarse (null: aún no se aplica). */
  appliedAmount: number | null;
  createdAt: string;
};

/** Estados que informa Wompi. */
export type MockWompiStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'ERROR' | 'VOIDED';

/** Lo que «tiene Wompi» de cada referencia (en Supabase lo responde el API de Wompi). */
type MockWompiRecord = { id: string; status: MockWompiStatus; method: string };

const WOMPI_TO_CONVIVE: Record<MockWompiStatus, PaymentStatusCode> = {
  APPROVED: 'APROBADA',
  DECLINED: 'RECHAZADA',
  PENDING: 'PENDIENTE',
  ERROR: 'ERROR',
  VOIDED: 'ANULADA',
};

let portfolio: Record<string, Record<string, number>> = {};
let gateway: PaymentGateway = initialGateway;
let transactions: MockTransaction[] = [];
let wompiRecords: Record<string, MockWompiRecord> = {};
let nextId = 1;

/** Restaura los datos simulados (lo usan las pruebas para empezar cada caso desde cero). */
export function resetMockPaymentsState() {
  portfolio = Object.fromEntries(
    Object.entries(initialPortfolio).map(([house, balances]) => [house, { ...balances }]),
  );
  gateway = { ...initialGateway, methods: [...initialGateway.methods] };
  transactions = [];
  wompiRecords = {};
  nextId = 1;
}
resetMockPaymentsState();

/** Solo para las pruebas: cambia el saldo de una unidad en un concepto. */
export function setMockBalance(house: string, conceptId: string, balance: number) {
  portfolio[house] = { ...portfolio[house], [conceptId]: balance };
}

/** Solo para las pruebas: simula la cuenta Wompi del conjunto (disponible y medios habilitados). */
export function setMockGateway(changes: Partial<PaymentGateway>) {
  gateway = { ...gateway, ...changes };
}

/**
 * La ventana de Wompi simulada registra el pago como lo haría Wompi. El estado NO se toma de aquí:
 * la app lo pide después a checkPaymentStatus, igual que con el Wompi real.
 */
export function simulateWompiPayment(reference: string, record: MockWompiRecord) {
  wompiRecords = { ...wompiRecords, [reference]: { ...record } };
}

/** Solo para las pruebas: Wompi cambia el estado de un pago (p. ej. un pendiente que se aprueba). */
export function setMockWompiStatus(reference: string, status: MockWompiStatus) {
  const record = wompiRecords[reference];
  if (record) wompiRecords = { ...wompiRecords, [reference]: { ...record, status } };
}

/** Solo para las pruebas: transacciones creadas, de la más antigua a la más reciente. */
export function getMockTransactions(): MockTransaction[] {
  return transactions.map((transaction) => ({ ...transaction }));
}

function statusFor(user: User): AccountStatus {
  const balances = portfolio[user.house] ?? {};
  return buildAccountStatus(catalog.map((concept) => ({ ...concept, balance: balances[concept.id] ?? 0 })));
}

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

/** CNV-{unidad}-{aaaammddhhmmss}-{consecutivo}: única aunque se pague dos veces en el mismo segundo. */
function createReference(house: string, date: Date) {
  const unit = house.replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `CNV-${unit}-${stamp}-${pad(nextId, 6)}`;
}

/** 64 caracteres hexadecimales con el formato de una firma SHA-256 (no es criptográfica). */
function simulatedSignature(text: string) {
  let hash = '';
  for (let round = 0; hash.length < 64; round += 1) {
    let value = 2166136261 ^ round;
    for (const char of `${round}:${text}`) {
      value = Math.imul(value ^ char.charCodeAt(0), 16777619);
    }
    hash += (value >>> 0).toString(16).padStart(8, '0');
  }
  return hash.slice(0, 64);
}

export async function getAccountStatus(user: User): Promise<AccountStatus> {
  await simulateNetwork(0.5);
  return statusFor(user);
}

export async function getPaymentGateway(): Promise<PaymentGateway> {
  await simulateNetwork(0.5);
  return { ...gateway, methods: [...gateway.methods] };
}

export async function startPayment(user: User, input: PaymentInput): Promise<PaymentCheckout> {
  await simulateNetwork();

  // Mismo orden que iniciar_pago(): validaciones, pago en proceso y luego la cuenta Wompi.
  const description = input.description?.trim() ?? '';
  const errors = validatePaymentSelection(
    { conceptId: input.conceptId, amount: input.amount, description },
    statusFor(user).concepts,
  );
  if (Object.keys(errors).length > 0) {
    throw new PaymentError('invalid');
  }

  const pending = transactions.find(
    (item) => item.house === user.house && item.conceptId === input.conceptId && item.status === 'PENDIENTE',
  );
  if (pending) {
    throw new PaymentError('pending', pending.transactionId);
  }

  if (!gateway.available) {
    throw new PaymentError('unavailable');
  }

  const reference = createReference(user.house, new Date());
  const amountInCents = toCents(input.amount);
  const checkout: PaymentCheckout = {
    transactionId: `t${nextId++}`,
    reference,
    amountInCents,
    currency: 'COP',
    signature: simulatedSignature(`${reference}${amountInCents}COP`),
    publicKey: MOCK_PUBLIC_KEY,
  };
  const concept = catalog.find((item) => item.id === input.conceptId);
  transactions = [
    ...transactions,
    {
      ...checkout,
      house: user.house,
      conceptId: input.conceptId,
      description: concept?.requiresDescription ? description : null,
      amount: amountInCents / 100,
      status: 'PENDIENTE',
      method: null,
      wompiId: null,
      appliedAmount: null,
      createdAt: new Date().toISOString(),
    },
  ];
  return checkout;
}

export async function cancelPayment(user: User, reference: string): Promise<void> {
  await simulateNetwork(0.5);
  transactions = transactions.map((item) =>
    item.reference === reference && item.house === user.house && item.status === 'PENDIENTE'
      ? { ...item, status: 'CANCELADA' }
      : item,
  );
}

/** Aplica el estado que reporta Wompi (mismas reglas que aplicar_estado_wompi en la base de datos). */
function applyWompiStatus(transaction: MockTransaction, record: MockWompiRecord): MockTransaction {
  let status = WOMPI_TO_CONVIVE[record.status];
  // Un pago que ya terminó no vuelve a PENDIENTE.
  if (status === 'PENDIENTE' && transaction.status !== 'PENDIENTE') status = transaction.status;

  const balances = (portfolio[transaction.house] ??= {});
  const balance = balances[transaction.conceptId] ?? 0;
  let appliedAmount = transaction.appliedAmount;
  if (status === 'APROBADA' && appliedAmount === null) {
    // Se descuenta una sola vez y nunca deja el saldo en negativo.
    appliedAmount = Math.min(balance, transaction.amount);
    balances[transaction.conceptId] = (toCents(balance) - toCents(appliedAmount)) / 100;
  } else if (status === 'ANULADA' && (appliedAmount ?? 0) > 0) {
    balances[transaction.conceptId] = (toCents(balance) + toCents(appliedAmount ?? 0)) / 100;
    appliedAmount = 0;
  }
  return { ...transaction, status, method: record.method, wompiId: record.id, appliedAmount };
}

export async function checkPaymentStatus(user: User, reference: string): Promise<PaymentStatus> {
  await simulateNetwork(0.5);
  const transaction = transactions.find((item) => item.reference === reference && item.house === user.house);
  const record = wompiRecords[reference];
  if (!transaction || !record) {
    return { inWompi: false, status: transaction?.status ?? null };
  }
  const updated = applyWompiStatus(transaction, record);
  transactions = transactions.map((item) => (item.reference === reference ? updated : item));
  return { inWompi: true, status: updated.status, method: record.method, wompiId: record.id };
}

export async function getPaymentResult(user: User, reference: string): Promise<PaymentResult | null> {
  await simulateNetwork(0.5);
  const transaction = transactions.find((item) => item.reference === reference && item.house === user.house);
  if (!transaction) return null;
  return {
    reference: transaction.reference,
    status: transaction.status,
    conceptId: transaction.conceptId,
    conceptName: catalog.find((item) => item.id === transaction.conceptId)?.name ?? transaction.conceptId,
    description: transaction.description,
    amount: transaction.amount,
    method: transaction.method,
    wompiId: transaction.wompiId,
    date: transaction.createdAt,
  };
}

/** Implementación del contrato PaymentsBackend que usa payments.service.ts. */
export const paymentsBackend = {
  getAccountStatus,
  getPaymentGateway,
  startPayment,
  cancelPayment,
  checkPaymentStatus,
  getPaymentResult,
} satisfies PaymentsBackend;
