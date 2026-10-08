import { hasPermission, homeRouteFor, roleLabels, type Permission } from '@/constants/permissions';
import type { Role } from '@/services/auth.service';

// Matriz de acceso esperada según el RF01 (y RF03/RF04 para finanzas y reportes).
const expected: Record<Role, Record<Permission, boolean>> = {
  administrador: { pagos: true, general: true, panel: true, finanzas: true, reportes: true, visitantes: false },
  junta_directiva: { pagos: true, general: true, panel: false, finanzas: false, reportes: true, visitantes: false },
  residente: { pagos: true, general: true, panel: false, finanzas: false, reportes: false, visitantes: false },
  vigilancia: { pagos: false, general: false, panel: false, finanzas: false, reportes: false, visitantes: true },
};

describe('hasPermission', () => {
  const cases = Object.entries(expected).flatMap(([role, permissions]) =>
    Object.entries(permissions).map(([permission, allowed]) => [role, permission, allowed] as const),
  );

  it.each(cases)('%s → %s: %s', (role, permission, allowed) => {
    expect(hasPermission(role as Role, permission as Permission)).toBe(allowed);
  });

  it('niega todo cuando no hay sesión', () => {
    expect(hasPermission(null, 'pagos')).toBe(false);
    expect(hasPermission(null, 'general')).toBe(false);
  });
});

describe('homeRouteFor', () => {
  it.each<[Role, string]>([
    ['administrador', '/panel'],
    ['junta_directiva', '/general'],
    ['residente', '/inicio'],
    ['vigilancia', '/visitantes'],
  ])('%s → %s', (role, route) => {
    expect(homeRouteFor(role)).toBe(route);
  });
});

describe('roleLabels', () => {
  it('tiene una etiqueta legible para cada rol', () => {
    expect(roleLabels).toEqual({
      administrador: 'Administrador',
      junta_directiva: 'Junta directiva',
      residente: 'Residente',
      vigilancia: 'Vigilancia',
    });
  });
});
