import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import {
  ALL_CATEGORIES,
  ATTACHMENT_MAX_BYTES,
  computeTotals,
  createMovement,
  getFinancialReport,
  isAllowedAttachment,
  listCategories,
  listMovements,
  listReportCategories,
  resetMockFinanceState,
  validateMovement,
  validateReportFilters,
  type MovementInput,
  type ReportFilters,
} from '@/services/finance.service';

const admin: User = {
  id: 'u2',
  name: 'David Muñoz',
  initials: 'DM',
  email: 'admin@convive.com',
  phone: '',
  house: '',
  address: '',
  role: 'administrador',
};

const TODAY = '2026-10-02';

const valid: MovementInput = {
  type: 'egreso',
  categoryId: 'egr-aseo',
  amount: 350000,
  date: '2026-10-01',
  description: 'Compra de insumos de aseo',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 2, 10, 0));
  resetMockFinanceState();
});
afterEach(() => jest.useRealTimers());

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

describe('validateMovement (reglas de RF03)', () => {
  it('acepta un movimiento válido', () => {
    expect(validateMovement(valid, TODAY)).toEqual({});
  });

  it('MSG-RF03-02: el monto debe ser mayor a 0', () => {
    expect(validateMovement({ ...valid, amount: 0 }, TODAY).amount).toBe(MSG.RF03.amountInvalid);
    expect(validateMovement({ ...valid, amount: -5 }, TODAY).amount).toBe(MSG.RF03.amountInvalid);
  });

  it('el monto no puede superar $ 999.999.999,99', () => {
    expect(validateMovement({ ...valid, amount: 999999999.99 }, TODAY).amount).toBeUndefined();
    expect(validateMovement({ ...valid, amount: 1_000_000_000 }, TODAY).amount).toBe(MSG.RF03.amountTooHigh);
  });

  it('MSG-RF03-03: la categoría es obligatoria, debe existir, estar activa y ser del tipo elegido', () => {
    expect(validateMovement({ ...valid, categoryId: '' }, TODAY).categoryId).toBe(MSG.RF03.categoryRequired);
    expect(validateMovement({ ...valid, categoryId: 'no-existe' }, TODAY).categoryId).toBeDefined();
    expect(validateMovement({ ...valid, categoryId: 'egr-eventos' }, TODAY).categoryId).toBeDefined();
    expect(validateMovement({ ...valid, categoryId: 'ing-admin' }, TODAY).categoryId).toBeDefined();
  });

  it('MSG-RF03-04: la fecha no puede ser posterior a hoy', () => {
    expect(validateMovement({ ...valid, date: TODAY }, TODAY).date).toBeUndefined();
    expect(validateMovement({ ...valid, date: '2026-10-03' }, TODAY).date).toBe(MSG.RF03.futureDate);
  });

  it('MSG-RF03-05: la descripción tiene entre 5 y 250 caracteres (sin contar espacios de los extremos)', () => {
    expect(validateMovement({ ...valid, description: '  abcd  ' }, TODAY).description).toBe(MSG.RF03.descriptionShort);
    expect(validateMovement({ ...valid, description: 'abcde' }, TODAY).description).toBeUndefined();
    expect(validateMovement({ ...valid, description: 'a'.repeat(251) }, TODAY).description).toBeDefined();
  });

  it('MSG-RF03-08: el soporte debe ser PDF, JPG o PNG de máximo 5 MB', () => {
    const file = { uri: 'file://x', name: 'x' };
    expect(validateMovement({ ...valid, attachment: { ...file, mimeType: 'application/pdf', size: 1000 } }, TODAY).attachment).toBeUndefined();
    expect(validateMovement({ ...valid, attachment: { ...file, mimeType: 'image/gif', size: 1000 } }, TODAY).attachment).toBe(MSG.RF03.invalidFile);
    expect(
      validateMovement({ ...valid, attachment: { ...file, mimeType: 'image/png', size: ATTACHMENT_MAX_BYTES + 1 } }, TODAY).attachment,
    ).toBe(MSG.RF03.invalidFile);
  });
});

describe('isAllowedAttachment', () => {
  it('acepta tamaños desconocidos (algunos selectores no los informan)', () => {
    expect(isAllowedAttachment({ mimeType: 'image/jpeg' })).toBe(true);
  });

  it('no distingue mayúsculas en el tipo', () => {
    expect(isAllowedAttachment({ mimeType: 'IMAGE/PNG', size: 10 })).toBe(true);
  });
});

describe('listCategories', () => {
  it('solo devuelve las categorías activas del tipo elegido, en orden alfabético', async () => {
    const ingresos = await run(listCategories('ingreso'));
    expect(ingresos.every((category) => category.type === 'ingreso' && category.active)).toBe(true);
    expect(ingresos.map((category) => category.name)).not.toContain('Donaciones');
    expect(ingresos.map((category) => category.name)).toEqual([...ingresos.map((c) => c.name)].sort((a, b) => a.localeCompare(b, 'es')));

    const egresos = await run(listCategories('egreso'));
    expect(egresos.map((category) => category.name)).toContain('Nómina');
    expect(egresos.map((category) => category.name)).not.toContain('Eventos');
  });
});

describe('createMovement', () => {
  it('guarda el movimiento con auditoría (usuario y fecha/hora de registro)', async () => {
    const saved = await run(createMovement({ ...valid, description: '  Compra de insumos de aseo  ' }, admin));

    expect(saved.description).toBe('Compra de insumos de aseo');
    expect(saved.createdBy).toEqual({ id: 'u2', name: 'David Muñoz' });
    // La hora de registro es la del "servidor" al guardar (incluye la latencia simulada).
    const savedAt = new Date(saved.createdAt).getTime() - new Date(2026, 9, 2, 10, 0).getTime();
    expect(savedAt).toBeGreaterThanOrEqual(0);
    expect(savedAt).toBeLessThan(1000);

    const all = await run(listMovements());
    expect(all[0].id).toBe(saved.id);
  });

  it('MSG-RF03-07: solo el administrador puede registrar movimientos', async () => {
    for (const role of ['junta_directiva', 'residente', 'vigilancia'] as const) {
      const assertion = expect(createMovement(valid, { ...admin, role })).rejects.toMatchObject({ code: 'forbidden' });
      await jest.runAllTimersAsync();
      await assertion;
    }
  });

  it('rechaza datos inválidos con el error de cada campo (validación del lado del servidor)', async () => {
    const assertion = expect(createMovement({ ...valid, amount: 0, date: '2030-01-01' }, admin)).rejects.toMatchObject({
      code: 'validation',
      fieldErrors: { amount: MSG.RF03.amountInvalid, date: MSG.RF03.futureDate },
    });
    await jest.runAllTimersAsync();
    await assertion;
  });
});

describe('listMovements', () => {
  it('ordena del más reciente al más antiguo', async () => {
    await run(createMovement({ ...valid, date: '2026-08-01', description: 'Movimiento antiguo' }, admin));
    const dates = (await run(listMovements())).map((movement) => movement.date);
    expect(dates).toEqual([...dates].sort().reverse());
  });
});

// ---------------------------------------------------------------------------------------------
// RF04 · Reportes financieros
// ---------------------------------------------------------------------------------------------

const october: ReportFilters = { from: '2026-10-01', to: TODAY, categoryId: ALL_CATEGORIES };

describe('validateReportFilters (reglas de RF04)', () => {
  it('acepta un rango válido', () => {
    expect(validateReportFilters(october, TODAY)).toEqual({});
  });

  it('MSG-RF04-02: la fecha inicial no puede ser mayor que la final', () => {
    expect(validateReportFilters({ ...october, from: '2026-10-02', to: '2026-10-01' }, TODAY).from).toBe(
      MSG.RF04.startAfterEnd,
    );
  });

  it('acepta un solo día (fecha inicial igual a la final)', () => {
    expect(validateReportFilters({ ...october, from: TODAY, to: TODAY }, TODAY)).toEqual({});
  });

  it('MSG-RF04-03: el rango máximo es de 12 meses', () => {
    expect(validateReportFilters({ ...october, from: '2025-10-02', to: TODAY }, TODAY)).toEqual({});
    expect(validateReportFilters({ ...october, from: '2025-10-01', to: TODAY }, TODAY).to).toBe(MSG.RF04.rangeTooLong);
  });

  it('la fecha final no puede ser posterior a hoy', () => {
    expect(validateReportFilters({ ...october, to: '2026-10-03' }, TODAY).to).toBe(MSG.RF04.endAfterToday);
  });
});

describe('computeTotals', () => {
  it('suma ingresos y egresos y calcula el saldo', () => {
    const base = { categoryId: 'x', date: TODAY, description: 'xxxxx', createdBy: { id: 'u2', name: 'D' }, createdAt: '' };
    const totals = computeTotals([
      { ...base, id: 'a', type: 'ingreso', amount: 1000 },
      { ...base, id: 'b', type: 'egreso', amount: 300.5 },
      { ...base, id: 'c', type: 'ingreso', amount: 200 },
    ]);
    expect(totals).toEqual({ income: 1200, expenses: 300.5, balance: 899.5 });
  });

  it('sin movimientos todo queda en 0', () => {
    expect(computeTotals([])).toEqual({ income: 0, expenses: 0, balance: 0 });
  });
});

describe('listReportCategories', () => {
  it('incluye todas las categorías, también las inactivas, primero egresos y luego ingresos', async () => {
    const categories = await run(listReportCategories());
    expect(categories.map((category) => category.name)).toEqual(expect.arrayContaining(['Eventos', 'Donaciones']));
    expect(categories[0].type).toBe('egreso');
    expect(categories[categories.length - 1].type).toBe('ingreso');
  });
});

describe('getFinancialReport', () => {
  it('filtra por rango de fechas, ordena cronológicamente y calcula los totales', async () => {
    const report = await run(getFinancialReport(october, admin));

    expect(report.movements.map((movement) => movement.date)).toEqual(['2026-10-01', '2026-10-01']);
    expect(report.totals).toEqual({ income: 2_150_000, expenses: 320_000, balance: 1_830_000 });
    expect(report.generatedBy).toEqual({ id: 'u2', name: 'David Muñoz' });
  });

  it('incluye los extremos del rango', async () => {
    const report = await run(getFinancialReport({ ...october, from: '2026-09-05', to: '2026-09-12' }, admin));
    expect(report.movements.map((movement) => movement.date)).toEqual(['2026-09-05', '2026-09-12']);
  });

  it('filtra por categoría', async () => {
    const report = await run(
      getFinancialReport({ from: '2026-07-01', to: TODAY, categoryId: 'egr-nomina' }, admin),
    );
    expect(report.movements).toHaveLength(3);
    expect(report.movements.every((movement) => movement.categoryId === 'egr-nomina')).toBe(true);
    expect(report.totals).toEqual({ income: 0, expenses: 9_600_000, balance: -9_600_000 });
  });

  it('incluye los movimientos registrados después (RF03)', async () => {
    await run(createMovement(valid, admin));
    const report = await run(getFinancialReport({ ...october, categoryId: 'egr-aseo' }, admin));
    expect(report.movements.map((movement) => movement.description)).toContain('Compra de insumos de aseo');
  });

  it('MSG-RF04-01: sin datos devuelve una lista vacía (la pantalla muestra el estado vacío)', async () => {
    const report = await run(getFinancialReport({ ...october, categoryId: 'ing-zonas' }, admin));
    expect(report.movements).toEqual([]);
    expect(report.totals).toEqual({ income: 0, expenses: 0, balance: 0 });
  });

  it('la junta directiva puede consultar los reportes (solo lectura)', async () => {
    const report = await run(getFinancialReport(october, { ...admin, role: 'junta_directiva' }));
    expect(report.movements).toHaveLength(2);
  });

  it('propietario y vigilancia no pueden consultar los reportes', async () => {
    for (const role of ['residente', 'vigilancia'] as const) {
      const assertion = expect(getFinancialReport(october, { ...admin, role })).rejects.toMatchObject({
        name: 'FinanceError',
        code: 'forbidden',
      });
      await jest.runAllTimersAsync();
      await assertion;
    }
  });

  it('el servicio también valida el rango (no confía en la pantalla)', async () => {
    const assertion = expect(
      getFinancialReport({ ...october, from: '2026-10-02', to: '2026-10-01' }, admin),
    ).rejects.toMatchObject({ code: 'validation', fieldErrors: { from: MSG.RF04.startAfterEnd } });
    await jest.runAllTimersAsync();
    await assertion;
  });
});
