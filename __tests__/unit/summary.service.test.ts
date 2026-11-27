import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.types';
import {
  getInitialBalance,
  getSummary,
  isValidInitialBalance,
  rangeForPeriod,
  resetMockSummaryState,
  setInitialBalance,
  validateSummaryRange,
} from '@/services/summary.service';
import { formatShortMonth } from '@/utils/date';

const TODAY = '2026-09-20';

const user = (role: User['role']): User => ({
  id: `u-${role}`,
  name: role,
  initials: 'XX',
  email: `${role}@convive.com`,
  phone: '',
  house: '56',
  address: '',
  complex: 'Conjunto Residencial Convive',
  role,
});

// El servicio simulado tiene latencia (setTimeout) y usa «hoy»: se fijan los timers y la fecha.
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 8, 20, 10, 30));
  resetMockSummaryState();
});
afterEach(() => jest.useRealTimers());

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

async function expectSummaryError(promise: Promise<unknown>, code: string) {
  const assertion = expect(promise).rejects.toMatchObject({ name: 'SummaryError', code });
  await jest.runAllTimersAsync();
  await assertion;
}

describe('rangeForPeriod', () => {
  it.each([
    ['este_mes', '2026-09-01', '2026-09-20'],
    ['mes_anterior', '2026-08-01', '2026-08-31'],
    ['ultimos_3', '2026-07-01', '2026-09-20'],
    ['ultimos_6', '2026-04-01', '2026-09-20'],
    ['este_ano', '2026-01-01', '2026-09-20'],
  ] as const)('%s → %s a %s', (period, from, to) => {
    expect(rangeForPeriod(period, TODAY)).toEqual({ from, to });
  });

  it('«Mes anterior» en enero es diciembre del año anterior', () => {
    expect(rangeForPeriod('mes_anterior', '2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});

describe('validateSummaryRange', () => {
  it('acepta un rango válido', () => {
    expect(validateSummaryRange({ from: '2026-01-01', to: TODAY }, TODAY)).toEqual({});
  });

  it('MSG-RF14-02: la fecha inicial no puede ser mayor que la final', () => {
    expect(validateSummaryRange({ from: '2026-09-10', to: '2026-09-01' }, TODAY).from).toBe(MSG.RF14.startAfterEnd);
  });

  it('la fecha final no puede ser posterior a hoy', () => {
    expect(validateSummaryRange({ from: '2026-09-01', to: '2026-09-21' }, TODAY).to).toBe(MSG.RF14.endAfterToday);
  });

  it('el rango es de máximo 12 meses', () => {
    expect(validateSummaryRange({ from: '2025-09-20', to: TODAY }, TODAY)).toEqual({});
    expect(validateSummaryRange({ from: '2025-09-19', to: TODAY }, TODAY).to).toBe(MSG.RF14.rangeTooLong);
  });
});

describe('isValidInitialBalance', () => {
  it.each([
    [0, true],
    [2_000_000.5, true],
    [999_999_999.99, true],
    [-1, false],
    [1_000_000_000, false],
    [10.555, false],
    [null, false],
  ])('%s → %s', (amount, valid) => {
    expect(isValidInitialBalance(amount)).toBe(valid);
  });
});

describe('formatShortMonth', () => {
  it('«2026-11» → «Nov»', () => {
    expect(formatShortMonth('2026-11')).toBe('Nov');
    expect(formatShortMonth('2027-01')).toBe('Ene');
  });
});

describe('getSummary (modo simulado)', () => {
  it('calcula el saldo hasta hoy y los totales del periodo con los movimientos simulados', async () => {
    const summary = await run(getSummary({ from: '2026-09-01', to: TODAY }, user('junta_directiva')));

    expect(summary.balance).toBe(14_850_000);
    expect(summary.income).toBe(8_580_000);
    expect(summary.expenses).toBe(1_250_000);
    expect(summary.monthly).toEqual([{ month: '2026-09', income: 8_580_000, expenses: 1_250_000 }]);
    expect(summary.expenseCategories).toEqual([{ name: 'Mantenimiento', total: 1_250_000 }]);
    expect(summary.pqrsByType).toEqual([{ type: 'queja', count: 1 }]);
    expect(summary.reservationsByZone[0]).toEqual({ zone: 'Cancha', count: 2 });
  });

  it('incluye un registro por mes aunque no tenga movimientos', async () => {
    const summary = await run(getSummary({ from: '2026-06-01', to: '2026-07-31' }, user('administrador')));

    expect(summary.monthly.map((m) => m.month)).toEqual(['2026-06', '2026-07']);
    expect(summary.monthly[0]).toEqual({ month: '2026-06', income: 0, expenses: 0 });
  });

  it('vigilancia no ve el resumen', async () => {
    await expectSummaryError(getSummary({ from: '2026-09-01', to: TODAY }, user('vigilancia')), 'forbidden');
  });

  it('rechaza un rango inválido', async () => {
    await expectSummaryError(getSummary({ from: '2026-09-10', to: '2026-09-01' }, user('administrador')), 'invalid_range');
  });
});

describe('saldo inicial (modo simulado)', () => {
  it('empieza en 0; el administrador lo cambia y se suma al saldo actual', async () => {
    const admin = user('administrador');
    expect(await run(getInitialBalance(admin))).toBe(0);

    expect(await run(setInitialBalance(2_000_000, admin))).toBe(2_000_000);

    const summary = await run(getSummary({ from: '2026-09-01', to: TODAY }, admin));
    expect(summary.initialBalance).toBe(2_000_000);
    expect(summary.balance).toBe(16_850_000);
  });

  it('solo el administrador lo consulta o lo cambia', async () => {
    await expectSummaryError(getInitialBalance(user('junta_directiva')), 'forbidden');
    await expectSummaryError(setInitialBalance(1, user('residente')), 'forbidden');
  });

  it('rechaza un valor negativo o con más de 2 decimales', async () => {
    await expectSummaryError(setInitialBalance(-1, user('administrador')), 'invalid_amount');
    await expectSummaryError(setInitialBalance(10.555, user('administrador')), 'invalid_amount');
  });
});
