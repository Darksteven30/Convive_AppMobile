import { hasPermission, roleLabels, type Permission } from '@/constants/permissions';
import type { Role } from '@/services/auth.service';

// Matriz de acceso esperada según el RF01.
const expected: Record<Role, Record<Permission, boolean>> = {
  administrador: { pagos: true, general: true },
  junta_directiva: { pagos: true, general: true },
  residente: { pagos: true, general: false },
  vigilancia: { pagos: false, general: false },
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
