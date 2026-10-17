import { AuthApiError } from '@supabase/supabase-js';

import { authBackend as supabaseAuth } from '@/services/auth.supabase';
import { AuthError } from '@/services/auth.types';

// Cliente de Supabase simulado: se verifica cómo el servicio traduce las respuestas y los errores
// de Supabase al contrato de la app, sin conectarse a un proyecto real.
const profileRow = {
  id: 'p1',
  email: 'monica@gmail.com',
  nombre: 'Monica Galvis',
  telefono: '3111234567',
  rol: 'residente',
  unidad: '56',
  direccion: 'Casa # 56 Cali - Valle',
  conjunto: 'Conjunto Residencial Convive',
};

let rpcResults: Record<string, unknown> = {};
let profile: typeof profileRow | null = profileRow;
let authListener: ((event: string) => void) | null = null;

const mockRpc = jest.fn((name: string, _args?: unknown) => {
  if (name === 'mi_perfil') {
    return { maybeSingle: async () => ({ data: profile, error: null }) };
  }
  const result = rpcResults[name];
  return Promise.resolve(result instanceof Error ? { data: null, error: result } : { data: result ?? null, error: null });
});

const ok = (data: unknown = {}) => Promise.resolve({ data, error: null });
const fail = (code: string) => Promise.resolve({ data: {}, error: new AuthApiError(code, 400, code) });

const mockAuth = {
  signInWithPassword: jest.fn(),
  signInWithOtp: jest.fn(),
  resetPasswordForEmail: jest.fn(),
  verifyOtp: jest.fn(),
  updateUser: jest.fn(),
  getSession: jest.fn(),
  // Como Supabase, cerrar la sesión (salvo scope «others») emite SIGNED_OUT.
  signOut: jest.fn(async ({ scope }: { scope: string }) => {
    if (scope !== 'others') authListener?.('SIGNED_OUT');
    return { error: null };
  }),
  onAuthStateChange: jest.fn((callback: (event: string) => void) => {
    authListener = callback;
    return { data: { subscription: { unsubscribe: () => (authListener = null) } } };
  }),
};

jest.mock('@/lib/supabase', () => ({
  isSupabaseEnabled: true,
  getSupabase: () => ({ rpc: mockRpc, auth: mockAuth }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  rpcResults = { minutos_bloqueo: 0, registrar_intento_fallido: 5, estado_correo: 'registered' };
  profile = profileRow;
  authListener = null;
  mockAuth.signInWithPassword.mockImplementation(() => ok());
  mockAuth.updateUser.mockImplementation(() => ok());
  mockAuth.resetPasswordForEmail.mockImplementation(() => ok());
  mockAuth.verifyOtp.mockImplementation(() => ok());
  mockAuth.signInWithOtp.mockImplementation(() => ok());
});

async function expectAuthError(promise: Promise<unknown>, code: string, extra: object = {}) {
  await expect(promise).rejects.toMatchObject({ name: 'AuthError', code, ...extra });
}

describe('lookupEmail', () => {
  it('consulta el estado del correo normalizado en la base de datos', async () => {
    rpcResults.estado_correo = 'pending';
    await expect(supabaseAuth.lookupEmail('  Nuevo@Convive.com ')).resolves.toBe('pending');
    expect(mockRpc).toHaveBeenCalledWith('estado_correo', { p_email: 'nuevo@convive.com' });
  });
});

describe('signIn', () => {
  it('inicia sesión, reinicia el contador de intentos y devuelve el perfil', async () => {
    const user = await supabaseAuth.signIn('monica@gmail.com', 'Residente123');

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'monica@gmail.com', password: 'Residente123' });
    // El contador se borra con la sesión ya iniciada (limpiar_intentos solo es de authenticated).
    expect(mockRpc).toHaveBeenCalledWith('limpiar_intentos', undefined);
    expect(user).toEqual({
      id: 'p1',
      name: 'Monica Galvis',
      initials: 'MG',
      email: 'monica@gmail.com',
      phone: '311 123 4567',
      house: '56',
      address: 'Casa # 56 Cali - Valle',
      complex: 'Conjunto Residencial Convive',
      role: 'residente',
    });
  });

  it('no intenta iniciar sesión si la cuenta está bloqueada', async () => {
    rpcResults.minutos_bloqueo = 12;
    await expectAuthError(supabaseAuth.signIn('monica@gmail.com', 'x'), 'locked');
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('MSG-RF01-04: con contraseña incorrecta registra el intento y devuelve los que quedan', async () => {
    mockAuth.signInWithPassword.mockImplementation(() => fail('invalid_credentials'));
    rpcResults.registrar_intento_fallido = 3;

    await expectAuthError(supabaseAuth.signIn('monica@gmail.com', 'mala'), 'invalid_credentials', { remainingAttempts: 3 });
    expect(mockRpc).toHaveBeenCalledWith('registrar_intento_fallido', { p_email: 'monica@gmail.com' });
    expect(mockRpc).not.toHaveBeenCalledWith('limpiar_intentos', undefined);
  });

  it('MSG-RF01-05: el quinto intento fallido bloquea la cuenta', async () => {
    mockAuth.signInWithPassword.mockImplementation(() => fail('invalid_credentials'));
    rpcResults.registrar_intento_fallido = 0;
    await expectAuthError(supabaseAuth.signIn('monica@gmail.com', 'mala'), 'locked');
  });

  it('si el proyecto exige confirmar el correo lo indica con un código propio', async () => {
    mockAuth.signInWithPassword.mockImplementation(() => fail('email_not_confirmed'));
    await expectAuthError(supabaseAuth.signIn('monica@gmail.com', 'Residente123'), 'confirmation_required');
  });
});

describe('requestAccountCode (verificar el correo antes de crear la contraseña)', () => {
  it('envía el código a un correo pre-registrado y crea su usuario de Auth si no existe', async () => {
    rpcResults.estado_correo = 'pending';
    await supabaseAuth.requestAccountCode(' Nuevo@Convive.com ');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
      email: 'nuevo@convive.com',
      options: { shouldCreateUser: true },
    });
  });

  it('no envía el código a correos no registrados o que ya tienen contraseña', async () => {
    rpcResults.estado_correo = 'not_found';
    await expectAuthError(supabaseAuth.requestAccountCode('nadie@convive.com'), 'not_found');
    rpcResults.estado_correo = 'registered';
    await expectAuthError(supabaseAuth.requestAccountCode('monica@gmail.com'), 'password_already_set');
    expect(mockAuth.signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('createPassword', () => {
  it('verifica el código del correo, define la contraseña y deja la sesión iniciada', async () => {
    const user = await supabaseAuth.createPassword('Nuevo@convive.com', '123456', 'NuevaClave1');

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'nuevo@convive.com', token: '123456', type: 'email' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'NuevaClave1' });
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    expect(user.name).toBe('Monica Galvis');
  });

  it('sin el código correcto no define ninguna contraseña (nadie se queda con la cuenta)', async () => {
    mockAuth.verifyOtp.mockImplementation(() => fail('otp_expired'));
    await expectAuthError(supabaseAuth.createPassword('nuevo@convive.com', '000000', 'NuevaClave1'), 'invalid_code');
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('rechaza una contraseña débil antes de gastar el código', async () => {
    await expectAuthError(supabaseAuth.createPassword('nuevo@convive.com', '123456', 'corta'), 'weak_password');
    expect(mockAuth.verifyOtp).not.toHaveBeenCalled();
  });

  it('si no se puede guardar la contraseña cierra la sesión temporal', async () => {
    mockAuth.updateUser.mockImplementation(() => fail('weak_password'));
    await expectAuthError(supabaseAuth.createPassword('nuevo@convive.com', '123456', 'NuevaClave1'), 'weak_password');
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('recuperación de contraseña', () => {
  it('envía el código solo a correos registrados', async () => {
    rpcResults.estado_correo = 'not_found';
    await expectAuthError(supabaseAuth.requestPasswordReset('nadie@convive.com'), 'not_found');
    expect(mockAuth.resetPasswordForEmail).not.toHaveBeenCalled();

    rpcResults.estado_correo = 'registered';
    await supabaseAuth.requestPasswordReset('Monica@gmail.com');
    expect(mockAuth.resetPasswordForEmail).toHaveBeenCalledWith('monica@gmail.com');
  });

  it('con el código correcto cambia la contraseña, desbloquea la cuenta y cierra la sesión temporal', async () => {
    await supabaseAuth.resetPassword('monica@gmail.com', '123456', 'NuevaClave1');

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({ email: 'monica@gmail.com', token: '123456', type: 'recovery' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'NuevaClave1' });
    expect(mockRpc).toHaveBeenCalledWith('desbloquear_cuenta', undefined);
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('con un código inválido o vencido no cambia nada', async () => {
    mockAuth.verifyOtp.mockImplementation(() => fail('otp_expired'));
    await expectAuthError(supabaseAuth.resetPassword('monica@gmail.com', '000000', 'NuevaClave1'), 'invalid_code');
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });
});

describe('changePassword (RF17)', () => {
  it('verifica la actual, cambia la contraseña y cierra la sesión en los demás dispositivos', async () => {
    await supabaseAuth.changePassword('monica@gmail.com', 'Residente123', 'NuevaClave1');

    expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({ email: 'monica@gmail.com', password: 'Residente123' });
    expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'NuevaClave1' });
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('MSG-RF17-02: contraseña actual incorrecta, y el intento cuenta para el bloqueo', async () => {
    mockAuth.signInWithPassword.mockImplementation(() => fail('invalid_credentials'));
    rpcResults.registrar_intento_fallido = 2;
    await expectAuthError(supabaseAuth.changePassword('monica@gmail.com', 'Mala1234', 'NuevaClave1'), 'wrong_password', {
      remainingAttempts: 2,
    });
    expect(mockRpc).toHaveBeenCalledWith('registrar_intento_fallido', { p_email: 'monica@gmail.com' });
    expect(mockAuth.updateUser).not.toHaveBeenCalled();
  });

  it('al quinto intento con la contraseña actual equivocada bloquea la cuenta', async () => {
    mockAuth.signInWithPassword.mockImplementation(() => fail('invalid_credentials'));
    rpcResults.registrar_intento_fallido = 0;
    await expectAuthError(supabaseAuth.changePassword('monica@gmail.com', 'Mala1234', 'NuevaClave1'), 'locked');
  });

  it('con la cuenta bloqueada no verifica la contraseña actual', async () => {
    rpcResults.minutos_bloqueo = 10;
    await expectAuthError(supabaseAuth.changePassword('monica@gmail.com', 'Residente123', 'NuevaClave1'), 'locked');
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('MSG-RF17-04 y 05: rechaza una contraseña igual o débil sin llamar a Supabase', async () => {
    await expectAuthError(supabaseAuth.changePassword('monica@gmail.com', 'Residente123', 'Residente123'), 'same_password');
    await expectAuthError(supabaseAuth.changePassword('monica@gmail.com', 'Residente123', 'corta'), 'weak_password');
    expect(mockAuth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe('updatePhone (RF16)', () => {
  it('guarda solo los dígitos y devuelve el perfil actualizado', async () => {
    await supabaseAuth.updatePhone('monica@gmail.com', '300 111 2233');
    expect(mockRpc).toHaveBeenCalledWith('actualizar_telefono', { p_telefono: '3001112233' });
  });

  it('MSG-RF16-02: rechaza un teléfono inválido sin llamar a Supabase', async () => {
    await expectAuthError(supabaseAuth.updatePhone('monica@gmail.com', '2111234567'), 'invalid_phone');
    expect(mockRpc).not.toHaveBeenCalledWith('actualizar_telefono', expect.anything());
  });
});

describe('sesión guardada', () => {
  it('sin sesión guardada devuelve null', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    await expect(supabaseAuth.getCurrentUser()).resolves.toBeNull();
  });

  it('con sesión guardada devuelve el perfil del usuario', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    await expect(supabaseAuth.getCurrentUser()).resolves.toMatchObject({ name: 'Monica Galvis', role: 'residente' });
  });

  it('si la sesión no tiene perfil la descarta', async () => {
    mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    profile = null;
    await expect(supabaseAuth.getCurrentUser()).resolves.toBeNull();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('subscribeToSessionEnd', () => {
  it('avisa cuando la sesión termina sola (p. ej. venció)', () => {
    const listener = jest.fn();
    const unsubscribe = supabaseAuth.subscribeToSessionEnd(listener);

    authListener?.('SIGNED_OUT');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    expect(authListener).toBeNull();
  });

  it('no avisa cuando el usuario cierra sesión desde la app', async () => {
    const listener = jest.fn();
    supabaseAuth.subscribeToSessionEnd(listener);

    await supabaseAuth.signOut();
    expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(listener).not.toHaveBeenCalled();
  });
});

it('AuthError conserva el código y los intentos restantes', () => {
  expect(new AuthError('invalid_credentials', 2)).toMatchObject({ code: 'invalid_credentials', remainingAttempts: 2 });
});
