// Servicio de autenticación simulado (mock). Se reemplazará por llamadas al backend
// manteniendo la misma interfaz: signIn / signOut.

export type Role = 'administrador' | 'junta_directiva' | 'residente' | 'vigilancia';

export type User = {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone: string;
  house: string;
  address: string;
  role: Role;
};

type MockAccount = User & { password: string };

const accounts: MockAccount[] = [
  {
    id: 'u1',
    name: 'Monica Galvis',
    initials: 'MG',
    email: 'monica@gmail.com',
    phone: '311 123 4567',
    house: '56',
    address: 'Casa # 56 Cali - Valle',
    role: 'residente',
    password: 'Residente123',
  },
  {
    id: 'u2',
    name: 'David Muñoz',
    initials: 'DM',
    email: 'admin@convive.com',
    phone: '300 765 4321',
    house: 'Administración',
    address: 'Oficina de administración',
    role: 'administrador',
    password: 'Admin123',
  },
  {
    id: 'u3',
    name: 'Carlos Rojas',
    initials: 'CR',
    email: 'junta@convive.com',
    phone: '315 222 3344',
    house: '12',
    address: 'Casa # 12 Cali - Valle',
    role: 'junta_directiva',
    password: 'Junta123',
  },
  {
    id: 'u4',
    name: 'Jorge Pérez',
    initials: 'JP',
    email: 'vigilancia@convive.com',
    phone: '318 555 6677',
    house: 'Portería',
    address: 'Portería principal',
    role: 'vigilancia',
    password: 'Vigilancia123',
  },
];

const NETWORK_DELAY_MS = 600;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AuthError extends Error {}

export async function signIn(email: string, password: string): Promise<User> {
  await delay(NETWORK_DELAY_MS);
  const account = accounts.find(
    (item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password,
  );
  if (!account) {
    throw new AuthError('Correo o contraseña incorrectos.');
  }
  const { password: _password, ...user } = account;
  return user;
}

export async function signOut(): Promise<void> {
  await delay(NETWORK_DELAY_MS / 2);
}
