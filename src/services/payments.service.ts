// Punto de entrada de los pagos: las pantallas importan desde aquí.
// Si la app tiene configurado Supabase (.env.local) usa payments.supabase.ts; si no, el servicio simulado.

import { isSupabaseEnabled } from '@/lib/supabase';
import { paymentsBackend as mockBackend } from '@/services/payments.mock';
import { paymentsBackend as supabaseBackend } from '@/services/payments.supabase';
import type { PaymentsBackend, WompiMethod } from '@/services/payments.types';

export {
  PaymentError,
  toCents,
  type AccountStatus,
  type PaymentCheckout,
  type PaymentConcept,
  type PaymentErrorCode,
  type PaymentGateway,
  type PaymentInput,
  type PaymentResult,
  type PaymentStatus,
  type PaymentStatusCode,
  type WompiMethod,
} from '@/services/payments.types';
export {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  validatePaymentSelection,
  type PaymentSelection,
  type SelectionErrors,
} from '@/services/payments.validation';
// Solo para las pruebas y el modo simulado.
export {
  getMockTransactions,
  resetMockPaymentsState,
  setMockBalance,
  setMockGateway,
  setMockWompiStatus,
  simulateWompiPayment,
  type MockWompiStatus,
} from '@/services/payments.mock';

const backend: PaymentsBackend = isSupabaseEnabled ? supabaseBackend : mockBackend;

/** RF15: con Supabase el pago se hace en el checkout real de Wompi; sin él, en la ventana simulada. */
export const usesRealCheckout = isSupabaseEnabled;

export const getAccountStatus: PaymentsBackend['getAccountStatus'] = (...args) => backend.getAccountStatus(...args);
export const getPaymentGateway: PaymentsBackend['getPaymentGateway'] = (...args) =>
  backend.getPaymentGateway(...args);
export const startPayment: PaymentsBackend['startPayment'] = (...args) => backend.startPayment(...args);
export const cancelPayment: PaymentsBackend['cancelPayment'] = (...args) => backend.cancelPayment(...args);
export const checkPaymentStatus: PaymentsBackend['checkPaymentStatus'] = (...args) =>
  backend.checkPaymentStatus(...args);
export const getPaymentResult: PaymentsBackend['getPaymentResult'] = (...args) => backend.getPaymentResult(...args);

/** Nombre de cada medio de Wompi para los chips y el comprobante. */
export const WOMPI_METHOD_LABELS: Record<WompiMethod, string> = {
  CARD: 'Tarjeta crédito/débito',
  PSE: 'PSE',
  NEQUI: 'Nequi',
  BANCOLOMBIA_TRANSFER: 'Botón Bancolombia',
  DAVIPLATA: 'Daviplata',
};
