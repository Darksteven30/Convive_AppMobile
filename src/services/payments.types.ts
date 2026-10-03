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

/** Funciones que debe ofrecer cada implementación de los pagos. */
export type PaymentsBackend = {
  /** RF11: conceptos del catálogo con el saldo pendiente de la unidad del usuario. */
  getAccountStatus(user: User): Promise<AccountStatus>;
};

/** Suma en centavos para no acumular errores de punto flotante (0,1 + 0,2). */
export function toCents(value: number): number {
  return Math.round(value * 100);
}

export function buildAccountStatus(concepts: PaymentConcept[]): AccountStatus {
  const total = concepts.reduce((sum, concept) => sum + toCents(concept.balance), 0) / 100;
  return { total, concepts };
}
