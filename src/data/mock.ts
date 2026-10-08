// Datos de ejemplo para la maqueta. Se reemplazarán por llamadas al backend.

export const news = [
  { id: 'n1', title: 'Mantenimiento de ascensor' },
  { id: 'n2', title: 'Asamblea general' },
  { id: 'n3', title: 'Cambio horario piscina' },
];

export const zones = ['Salon social', 'Cancha', 'BBq'];

export type Pqrs = { id: string; code: string; title: string };

export const pqrsList: Pqrs[] = [
  { id: 'p231', code: '#0231', title: 'Daño portón' },
  { id: 'p225', code: '#0225', title: 'Ruido torre 4' },
  { id: 'p198', code: '#0198', title: 'Fuga de agua' },
];

export const financialSummary = {
  balance: 10000000,
  income: 10000000,
  expenses: 1000000,
  monthly: [
    { label: 'Ene', income: 3000000, expenses: 1200000 },
    { label: 'Feb', income: 2800000, expenses: 1300000 },
    { label: 'Mar', income: 2900000, expenses: 1450000 },
  ],
};

export type Category = { label: string; value: number; color: string };

export const expenseCategories: Category[] = [
  { label: 'Nómina', value: 60, color: '#1E3A8A' },
  { label: 'Mantenimiento', value: 10, color: '#38BDF8' },
  { label: 'Administración', value: 10, color: '#16A34A' },
  { label: 'Servicios', value: 10, color: '#DC2626' },
  { label: 'Otros', value: 10, color: '#F97316' },
];

export const pqrsCategories: Category[] = [
  { label: 'Daños', value: 40, color: '#1E3A8A' },
  { label: 'Ruido', value: 25, color: '#38BDF8' },
  { label: 'Seguridad', value: 20, color: '#16A34A' },
  { label: 'Otros', value: 15, color: '#F97316' },
];

export const bookingCategories: Category[] = [
  { label: 'Salón social', value: 50, color: '#1E3A8A' },
  { label: 'Cancha', value: 30, color: '#38BDF8' },
  { label: 'BBQ', value: 20, color: '#16A34A' },
];

// Indicadores del panel de administración.
export const adminSummary = {
  portfolioDue: 12450000,
  unitsInArrears: 8,
  totalUnits: 120,
  pendingPqrs: 3,
};

export type ExpectedVisitor = { id: string; name: string; unit: string; time: string };

// Visitantes esperados hoy (el registro de entradas y salidas es RF10).
export const expectedVisitors: ExpectedVisitor[] = [];
