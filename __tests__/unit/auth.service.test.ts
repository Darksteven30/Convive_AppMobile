import { AuthError, signIn, signOut, type Role } from '@/services/auth.service';

// El servicio simula latencia de red con setTimeout; los timers falsos evitan esperas reales.
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

async function resolveWithTimers<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

describe('auth.service · signIn', () => {
  it.each<[string, string, Role]>([
    ['admin@convive.com', 'Admin123', 'administrador'],
    ['junta@convive.com', 'Junta123', 'junta_directiva'],
    ['monica@gmail.com', 'Residente123', 'residente'],
    ['vigilancia@convive.com', 'Vigilancia123', 'vigilancia'],
  ])('autentica a %s con el rol %s', async (email, password, role) => {
    const user = await resolveWithTimers(signIn(email, password));
    expect(user.email).toBe(email);
    expect(user.role).toBe(role);
  });

  it('no expone la contraseña en el usuario devuelto', async () => {
    const user = await resolveWithTimers(signIn('admin@convive.com', 'Admin123'));
    expect(user).not.toHaveProperty('password');
  });

  it('ignora mayúsculas y espacios en el correo', async () => {
    const user = await resolveWithTimers(signIn('  ADMIN@Convive.com ', 'Admin123'));
    expect(user.role).toBe('administrador');
  });

  it('distingue mayúsculas en la contraseña', async () => {
    const assertion = expect(signIn('admin@convive.com', 'admin123')).rejects.toThrow(AuthError);
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('rechaza un correo que no existe', async () => {
    const assertion = expect(signIn('nadie@convive.com', 'Admin123')).rejects.toThrow('Correo o contraseña incorrectos.');
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('rechaza la contraseña de otro usuario', async () => {
    const assertion = expect(signIn('admin@convive.com', 'Residente123')).rejects.toBeInstanceOf(AuthError);
    await jest.runAllTimersAsync();
    await assertion;
  });
});

describe('auth.service · signOut', () => {
  it('se resuelve sin errores', async () => {
    await expect(resolveWithTimers(signOut())).resolves.toBeUndefined();
  });
});
