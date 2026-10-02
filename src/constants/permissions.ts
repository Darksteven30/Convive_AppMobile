import type { Href } from 'expo-router';

import type { Role } from '@/services/auth.service';

export const roleLabels: Record<Role, string> = {
  administrador: 'Administrador',
  junta_directiva: 'Junta directiva',
  residente: 'Residente',
  vigilancia: 'Vigilancia',
};

/** Funcionalidades restringidas y los roles que pueden usarlas. Lo no listado es para todos. */
const permissions = {
  // Estado de cuenta, historial y flujo de pago: quienes tienen una unidad o la administran.
  pagos: ['administrador', 'junta_directiva', 'residente'],
  // Resumen financiero general del conjunto.
  general: ['administrador', 'junta_directiva'],
  // Panel de administración con indicadores de cartera y PQRS pendientes.
  panel: ['administrador'],
  // Registro de ingresos y egresos (RF03).
  finanzas: ['administrador'],
  // Registro de visitantes (RF10).
  visitantes: ['vigilancia'],
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof permissions;

export function hasPermission(role: Role | null, permission: Permission): boolean {
  return !!role && (permissions[permission] as Role[]).includes(role);
}

/**
 * Pantalla principal de cada rol al iniciar sesión (RF01, sección 5 del documento).
 * La junta directiva entra al dashboard financiero de solo lectura.
 */
const homeRoutes: Record<Role, Href> = {
  administrador: '/panel',
  junta_directiva: '/general',
  residente: '/inicio',
  vigilancia: '/visitantes',
};

export function homeRouteFor(role: Role): Href {
  return homeRoutes[role];
}
