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
} satisfies Record<string, Role[]>;

export type Permission = keyof typeof permissions;

export function hasPermission(role: Role | null, permission: Permission): boolean {
  return !!role && (permissions[permission] as Role[]).includes(role);
}
