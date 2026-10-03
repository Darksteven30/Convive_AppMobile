import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { mockNetwork } from '@/services/mockNetwork';
import {
  getAccountStatus,
  resetMockPaymentsState,
  setMockBalance,
  toCents,
  validatePaymentSelection,
  type PaymentConcept,
} from '@/services/payments.service';

const resident = (house: string): User => ({
  id: 'u1',
  name: 'Monica Galvis',
  initials: 'MG',
  email: 'monica@gmail.com',
  phone: '',
  house,
  address: '',
  role: 'residente',
});

const concepts: PaymentConcept[] = [
  { id: 'administracion', name: 'Cuota administración', requiresDescription: false, balance: 35000 },
  { id: 'extraordinaria', name: 'Cuota extraordinaria', requiresDescription: false, balance: 0 },
  { id: 'otros', name: 'Otros conceptos', requiresDescription: true, balance: 10678.9 },
];

beforeEach(() => {
  resetMockPaymentsState();
  mockNetwork.delayMs = 0;
});

describe('getAccountStatus (simulado)', () => {
  it('devuelve el catálogo con el saldo de cada concepto y el total de la unidad', async () => {
    const status = await getAccountStatus(resident('56'));

    expect(status.concepts.map((item) => [item.id, item.balance])).toEqual([
      ['administracion', 35000],
      ['extraordinaria', 0],
      ['otros', 10678.9],
    ]);
    expect(status.concepts.find((item) => item.id === 'otros')?.requiresDescription).toBe(true);
    expect(status.total).toBe(45678.9);
  });

  it('una unidad sin cartera está al día: todos los conceptos en 0', async () => {
    const status = await getAccountStatus(resident('Administración'));

    expect(status.concepts).toHaveLength(3);
    expect(status.concepts.every((item) => item.balance === 0)).toBe(true);
    expect(status.total).toBe(0);
  });

  it('suma en centavos sin errores de punto flotante', async () => {
    setMockBalance('99', 'administracion', 0.1);
    setMockBalance('99', 'otros', 0.2);

    expect((await getAccountStatus(resident('99'))).total).toBe(0.3);
  });
});

describe('validatePaymentSelection (RF11)', () => {
  const validate = (input: Partial<Parameters<typeof validatePaymentSelection>[0]>) =>
    validatePaymentSelection({ conceptId: 'administracion', amount: 35000, description: '', ...input }, concepts);

  it('acepta el saldo completo o un abono parcial', () => {
    expect(validate({})).toEqual({});
    expect(validate({ amount: 0.01 })).toEqual({});
    expect(validate({ amount: 20000.5 })).toEqual({});
  });

  it('MSG-RF11-01: el concepto es obligatorio y debe estar en el catálogo', () => {
    expect(validate({ conceptId: null })).toEqual({ concept: MSG.RF11.conceptRequired });
    expect(validate({ conceptId: 'inventado' })).toEqual({ concept: MSG.RF11.conceptRequired });
  });

  it('MSG-RF11-02: el valor debe ser mayor a 0', () => {
    expect(validate({ amount: null }).amount).toBe(MSG.RF11.amountInvalid);
    expect(validate({ amount: 0 }).amount).toBe('El valor debe ser mayor a $ 0.');
    expect(validate({ amount: -5 }).amount).toBe(MSG.RF11.amountInvalid);
  });

  it('MSG-RF11-03: el valor no puede superar el saldo del concepto', () => {
    expect(validate({ amount: 35000.01 }).amount).toBe(
      'El valor no puede superar el saldo pendiente de este concepto ($ 35.000,00).',
    );
    expect(validate({ conceptId: 'otros', amount: 10678.9, description: 'Parqueadero' })).toEqual({});
    expect(validate({ conceptId: 'otros', amount: 10678.91, description: 'Parqueadero' }).amount).toBe(
      'El valor no puede superar el saldo pendiente de este concepto ($ 10.678,90).',
    );
  });

  it('un concepto sin saldo acepta cualquier valor mayor a 0', () => {
    expect(validate({ conceptId: 'extraordinaria', amount: 50000 })).toEqual({});
    expect(validate({ conceptId: 'extraordinaria', amount: 0 }).amount).toBe(MSG.RF11.amountInvalid);
  });

  it('«Otros conceptos» pide una descripción de 5 a 100 caracteres', () => {
    const otros = (description: string) => validate({ conceptId: 'otros', amount: 1000, description });

    expect(otros('').description).toBe(MSG.RF11.descriptionLength);
    expect(otros('  abc  ').description).toBe(MSG.RF11.descriptionLength);
    expect(otros('Multa')).toEqual({});
    expect(otros('x'.repeat(100))).toEqual({});
    expect(otros('x'.repeat(101)).description).toBe(MSG.RF11.descriptionLength);
    // Los demás conceptos no la piden.
    expect(validate({ description: '' })).toEqual({});
  });

  it('toCents redondea a centavos', () => {
    expect(toCents(45678.9)).toBe(4567890);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});
