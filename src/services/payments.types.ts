// Tipos y contrato común de los pagos. Lo cumplen el servicio simulado (payments.mock.ts) y el
// de Supabase (payments.supabase.ts); las pantallas solo conocen este contrato vía payments.service.ts.

import type { User } from '@/services/auth.types';

/** Concepto del catálogo con el saldo pendiente de la unidad en ese concepto. */
export type PaymentConcept = {
  /** ID del catálogo: «administracion», «extraordinaria», «otros». */
  id: string;
  name: string;
  /** «Otros conceptos» pide además una descripción de lo que se paga. */
  requiresDescription: boolean;
  /** Saldo pendiente en pesos (0 si la unidad está al día en este concepto). */
  balance: number;
};

export type AccountStatus = {
  /** «Estado de la cuenta»: saldo total pendiente de la unidad. */
  total: number;
  concepts: PaymentConcept[];
};

/** Medios de pago de Wompi (payment_method_type). */
export type WompiMethod = 'CARD' | 'PSE' | 'NEQUI' | 'BANCOLOMBIA_TRANSFER' | 'DAVIPLATA';

export type PaymentGateway = {
  /** El conjunto tiene su cuenta Wompi activa (llave pública y secreto configurados). */
  available: boolean;
  /** Medios habilitados en la cuenta Wompi del conjunto (chips informativos). */
  methods: WompiMethod[];
};

export type PaymentInput = {
  conceptId: string;
  amount: number;
  /** Solo en los conceptos que la piden («Otros conceptos»). */
  description?: string;
};

/** Transacción PENDIENTE creada en el servidor: lo necesario para abrir el Widget de Wompi. */
export type PaymentCheckout = {
  transactionId: string;
  /** Referencia única de Convive, p. ej. CNV-56-20261005103000-A1B2C3. */
  reference: string;
  /** Valor en centavos, como lo exige Wompi: $ 45.678,90 → 4567890. */
  amountInCents: number;
  currency: 'COP';
  /** Firma de integridad SHA-256 calculada en el servidor. */
  signature: string;
  /** Llave pública de Wompi del conjunto (la única llave que llega a la app). */
  publicKey: string;
  /**
   * RF15: dirección del checkout real de Wompi con estos datos. Sin ella (modo simulado) la app
   * muestra la ventana de Wompi simulada.
   */
  checkoutUrl?: string;
};

/** Estados de la transacción en Convive (los finales los confirma Wompi). */
export type PaymentStatusCode = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'ERROR' | 'ANULADA' | 'CANCELADA';

/** RF15: estado de un pago después de consultarlo en el API de Wompi. */
export type PaymentStatus = {
  /** false si Wompi aún no tiene ninguna transacción con esa referencia (la persona no pagó). */
  inWompi: boolean;
  status: PaymentStatusCode | null;
  /** Medio que usó la persona en Wompi (payment_method_type). */
  method?: string;
  wompiId?: string;
};

/**
 * - pending: ya hay un pago PENDIENTE del mismo concepto (MSG-RF12-03).
 * - unavailable: Wompi no está disponible para el conjunto (MSG-RF12-04).
 * - invalid: el servidor rechazó el concepto, el valor o la descripción.
 * - failed: no se pudo crear la transacción o la firma (MSG-RF12-01).
 */
export type PaymentErrorCode = 'pending' | 'unavailable' | 'invalid' | 'failed';

export class PaymentError extends Error {
  constructor(
    public readonly code: PaymentErrorCode,
    /** Con «pending»: la transacción que sigue en proceso. */
    public readonly transactionId?: string,
  ) {
    super(code);
    this.name = 'PaymentError';
  }
}

/** Funciones que debe ofrecer cada implementación de los pagos. */
export type PaymentsBackend = {
  /** RF11: conceptos del catálogo con el saldo pendiente de la unidad del usuario. */
  getAccountStatus(user: User): Promise<AccountStatus>;
  /** RF12: si Wompi está disponible y qué medios tiene habilitados el conjunto. */
  getPaymentGateway(user: User): Promise<PaymentGateway>;
  /** RF12: crea la transacción PENDIENTE con referencia y firma. Falla con PaymentError. */
  startPayment(user: User, input: PaymentInput): Promise<PaymentCheckout>;
  /** RF12: la persona cerró la ventana de Wompi sin pagar (MSG-RF12-02). */
  cancelPayment(user: User, reference: string): Promise<void>;
  /** RF15: consulta en Wompi el estado del pago y lo aplica en el servidor. */
  checkPaymentStatus(user: User, reference: string): Promise<PaymentStatus>;
};

/** Suma en centavos para no acumular errores de punto flotante (0,1 + 0,2). */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function buildAccountStatus(concepts: PaymentConcept[]): AccountStatus {
  const total = concepts.reduce((sum, concept) => sum + toCents(concept.balance), 0) / 100;
  return { total, concepts };
}
