// Pagos con Supabase (RF11, RF12 y RF15). Cumple el mismo contrato que el servicio simulado
// (payments.types.ts). El esquema y las funciones están en supabase/migrations:
// 20261004000000_seleccion_concepto_pago.sql (estado de la cuenta) y 20261005000000_pago_wompi.sql
// (transacciones, referencia y firma); el estado lo consulta la Edge Function wompi-estado (RF15).
// La unidad sale de la sesión en el servidor (auth.uid()), no del usuario que envía la app.

import { getSupabase } from '@/lib/supabase';
import {
  PaymentError,
  buildAccountStatus,
  type AccountStatus,
  type PaymentCheckout,
  type PaymentGateway,
  type PaymentInput,
  type PaymentResult,
  type PaymentStatus,
  type PaymentsBackend,
  type WompiMethod,
} from '@/services/payments.types';

/** Fila que devuelve la función mi_estado_cuenta() de la base de datos. */
type AccountRow = {
  concepto_id: string;
  nombre: string;
  requiere_descripcion: boolean;
  /** numeric(18,2): PostgREST puede devolverlo como número o como texto. */
  saldo: number | string;
};

/** Fila que devuelve pasarela_pagos(). */
type GatewayRow = { disponible: boolean; medios: string[] | null };

/** Fila que devuelve iniciar_pago(). */
type CheckoutRow = {
  transaccion_id: string;
  referencia: string;
  monto_centavos: number | string;
  moneda: 'COP';
  firma: string;
  llave_publica: string;
};

type RpcError = { message?: string; details?: string | null };

/** Web Checkout de Wompi (el mismo para Sandbox y Producción: lo define la llave pública). */
const WOMPI_CHECKOUT_URL = 'https://checkout.wompi.co/p/';

/** Dirección del checkout con los datos que generó el servidor. La firma nunca se calcula en la app. */
export function buildCheckoutUrl(checkout: Omit<PaymentCheckout, 'checkoutUrl' | 'transactionId'>): string {
  const params = [
    ['public-key', checkout.publicKey],
    ['currency', checkout.currency],
    ['amount-in-cents', String(checkout.amountInCents)],
    ['reference', checkout.reference],
    ['signature:integrity', checkout.signature],
  ];
  return `${WOMPI_CHECKOUT_URL}?${params.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')}`;
}

const WOMPI_METHODS: WompiMethod[] = ['CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_TRANSFER', 'DAVIPLATA'];

/** Traduce los errores de iniciar_pago() al contrato de la app. */
function toPaymentError(error: RpcError): PaymentError {
  const message = error.message ?? '';
  if (message.includes('pago_pendiente')) return new PaymentError('pending', error.details || undefined);
  if (message.includes('wompi_no_disponible')) return new PaymentError('unavailable');
  if (/concepto_invalido|valor_invalido|descripcion_invalida|sin_unidad/.test(message)) {
    return new PaymentError('invalid');
  }
  return new PaymentError('failed');
}

export async function getAccountStatus(): Promise<AccountStatus> {
  const { data, error } = await getSupabase().rpc('mi_estado_cuenta');
  if (error) throw error;
  return buildAccountStatus(
    ((data ?? []) as AccountRow[]).map((row) => ({
      id: row.concepto_id,
      name: row.nombre,
      requiresDescription: row.requiere_descripcion,
      balance: Number(row.saldo),
    })),
  );
}

export async function getPaymentGateway(): Promise<PaymentGateway> {
  const { data, error } = await getSupabase().rpc('pasarela_pagos').maybeSingle<GatewayRow>();
  if (error) throw error;
  return {
    available: Boolean(data?.disponible),
    methods: (data?.medios ?? []).filter((method): method is WompiMethod =>
      WOMPI_METHODS.includes(method as WompiMethod),
    ),
  };
}

export async function startPayment(_user: unknown, input: PaymentInput): Promise<PaymentCheckout> {
  const { data, error } = await getSupabase()
    .rpc('iniciar_pago', {
      p_concepto_id: input.conceptId,
      p_valor: input.amount,
      p_descripcion: input.description ?? null,
    })
    .maybeSingle<CheckoutRow>();
  if (error) throw toPaymentError(error);
  if (!data) throw new PaymentError('failed');
  const checkout = {
    reference: data.referencia,
    amountInCents: Number(data.monto_centavos),
    currency: 'COP' as const,
    signature: data.firma,
    publicKey: data.llave_publica,
  };
  return { ...checkout, transactionId: data.transaccion_id, checkoutUrl: buildCheckoutUrl(checkout) };
}

export async function cancelPayment(_user: unknown, reference: string): Promise<void> {
  const { error } = await getSupabase().rpc('cancelar_pago', { p_referencia: reference });
  if (error) throw error;
}

/** Respuesta de la Edge Function wompi-estado (supabase/functions/wompi-estado). */
type StatusResponse = { estado: PaymentStatus['status']; enWompi: boolean; wompiId?: string; medio?: string };

export async function checkPaymentStatus(_user: unknown, reference: string): Promise<PaymentStatus> {
  const { data, error } = await getSupabase().functions.invoke<StatusResponse>('wompi-estado', {
    body: { referencia: reference },
  });
  if (error) throw error;
  if (!data) throw new PaymentError('failed');
  return { inWompi: data.enWompi, status: data.estado, method: data.medio, wompiId: data.wompiId };
}

/** Fila de transacciones_pago con el nombre del concepto (RLS: solo pagos de la propia unidad). */
type ResultRow = {
  referencia: string;
  estado: PaymentResult['status'];
  concepto_id: string;
  descripcion: string | null;
  monto: number | string;
  medio_pago: string | null;
  wompi_id: string | null;
  created_at: string;
  conceptos_pago: { nombre: string } | { nombre: string }[] | null;
};

export async function getPaymentResult(_user: unknown, reference: string): Promise<PaymentResult | null> {
  const { data, error } = await getSupabase()
    .from('transacciones_pago')
    .select('referencia, estado, concepto_id, descripcion, monto, medio_pago, wompi_id, created_at, conceptos_pago(nombre)')
    .eq('referencia', reference)
    .maybeSingle<ResultRow>();
  if (error) throw error;
  if (!data) return null;
  const concept = Array.isArray(data.conceptos_pago) ? data.conceptos_pago[0] : data.conceptos_pago;
  return {
    reference: data.referencia,
    status: data.estado,
    conceptId: data.concepto_id,
    conceptName: concept?.nombre ?? data.concepto_id,
    description: data.descripcion,
    amount: Number(data.monto),
    method: data.medio_pago,
    wompiId: data.wompi_id,
    date: data.created_at,
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
