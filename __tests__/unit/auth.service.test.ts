import {
  AuthError,
  changePassword,
  MOCK_RESET_CODE,
  createPassword,
  lookupEmail,
  requestPasswordReset,
  resetMockAuthState,
  resetPassword,
  signIn,
  signOut,
  updatePhone,
  type Role,
} from '@/services/auth.service';

// El servicio simula latencia de red con setTimeout; los timers falsos evitan esperas reales.
beforeEach(() => {
  jest.useFakeTimers();
  resetMockAuthState();
});
afterEach(() => jest.useRealTimers());

async function run<T>(promise: Promise<T>): Promise<T> {
  await jest.runAllTimersAsync();
  return promise;
}

/** Espera el rechazo con el código de AuthError indicado (adjunta el expect antes de avanzar timers). */
async function expectAuthError(promise: Promise<unknown>, code: string) {
  const assertion = expect(promise).rejects.toMatchObject({ name: 'AuthError', code });
  await jest.runAllTimersAsync();
  await assertion;
}

describe('lookupEmail', () => {
  it('distingue cuentas registradas, pre-registradas e inexistentes', async () => {
    expect(await run(lookupEmail('monica@gmail.com'))).toBe('registered');
    expect(await run(lookupEmail('nuevo@convive.com'))).toBe('pending');
    expect(await run(lookupEmail('nadie@convive.com'))).toBe('not_found');
  });

  it('ignora mayúsculas y espacios en el correo', async () => {
    expect(await run(lookupEmail('  MONICA@gmail.com '))).toBe('registered');
  });
});

describe('signIn', () => {
  it.each<[string, string, Role]>([
    ['admin@convive.com', 'Admin123', 'administrador'],
    ['junta@convive.com', 'Junta123', 'junta_directiva'],
    ['monica@gmail.com', 'Residente123', 'residente'],
    ['vigilancia@convive.com', 'Vigilancia123', 'vigilancia'],
  ])('autentica a %s con el rol %s', async (email, password, role) => {
    const user = await run(signIn(email, password));
    expect(user.email).toBe(email);
    expect(user.role).toBe(role);
  });

  it('no expone la contraseña en el usuario devuelto', async () => {
    const user = await run(signIn('admin@convive.com', 'Admin123'));
    expect(user).not.toHaveProperty('password');
  });

  it('distingue mayúsculas en la contraseña', async () => {
    await expectAuthError(signIn('admin@convive.com', 'admin123'), 'invalid_credentials');
  });

  it('informa los intentos restantes', async () => {
    const assertion = expect(signIn('admin@convive.com', 'mala')).rejects.toMatchObject({ remainingAttempts: 4 });
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('una cuenta pre-registrada no puede entrar sin crear su contraseña', async () => {
    await expectAuthError(signIn('nuevo@convive.com', 'Cualquiera1'), 'invalid_credentials');
  });

  it('bloquea 15 minutos al quinto intento fallido', async () => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expectAuthError(signIn('admin@convive.com', 'mala'), 'invalid_credentials');
    }
    await expectAuthError(signIn('admin@convive.com', 'mala'), 'locked');
    await expectAuthError(signIn('admin@convive.com', 'Admin123'), 'locked');

    jest.setSystemTime(Date.now() + 15 * 60 * 1000);
    const user = await run(signIn('admin@convive.com', 'Admin123'));
    expect(user.role).toBe('administrador');
  });

  it('un inicio de sesión correcto reinicia el contador de intentos', async () => {
    await expectAuthError(signIn('admin@convive.com', 'mala'), 'invalid_credentials');
    await run(signIn('admin@convive.com', 'Admin123'));

    const assertion = expect(signIn('admin@convive.com', 'mala')).rejects.toMatchObject({ remainingAttempts: 4 });
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('los intentos se cuentan por correo', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expectAuthError(signIn('admin@convive.com', 'mala'), attempt < 5 ? 'invalid_credentials' : 'locked');
    }
    const user = await run(signIn('monica@gmail.com', 'Residente123'));
    expect(user.role).toBe('residente');
  });
});

describe('createPassword', () => {
  it('asigna la primera contraseña y devuelve el usuario', async () => {
    const user = await run(createPassword('nuevo@convive.com', 'NuevaClave1'));
    expect(user.name).toBe('Laura Gómez');
    expect(await run(lookupEmail('nuevo@convive.com'))).toBe('registered');
    expect((await run(signIn('nuevo@convive.com', 'NuevaClave1'))).id).toBe(user.id);
  });

  it('no permite reemplazar una contraseña existente', async () => {
    await expectAuthError(createPassword('monica@gmail.com', 'OtraClave1'), 'password_already_set');
  });

  it('rechaza correos inexistentes', async () => {
    await expectAuthError(createPassword('nadie@convive.com', 'OtraClave1'), 'not_found');
  });
});

describe('recuperación de contraseña', () => {
  it('con el código correcto cambia la contraseña', async () => {
    await run(requestPasswordReset('monica@gmail.com'));
    await run(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'NuevaClave1'));

    await expectAuthError(signIn('monica@gmail.com', 'Residente123'), 'invalid_credentials');
    expect((await run(signIn('monica@gmail.com', 'NuevaClave1'))).role).toBe('residente');
  });

  it('rechaza un código incorrecto o sin solicitar', async () => {
    await expectAuthError(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'NuevaClave1'), 'invalid_code');

    await run(requestPasswordReset('monica@gmail.com'));
    await expectAuthError(resetPassword('monica@gmail.com', '000000', 'NuevaClave1'), 'invalid_code');
  });

  it('el código vence a los 10 minutos', async () => {
    await run(requestPasswordReset('monica@gmail.com'));
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await expectAuthError(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'NuevaClave1'), 'invalid_code');
  });

  it('el código solo sirve una vez', async () => {
    await run(requestPasswordReset('monica@gmail.com'));
    await run(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'NuevaClave1'));
    await expectAuthError(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'OtraClave1'), 'invalid_code');
  });

  it('desbloquea una cuenta bloqueada', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expectAuthError(signIn('monica@gmail.com', 'mala'), attempt < 5 ? 'invalid_credentials' : 'locked');
    }
    await run(requestPasswordReset('monica@gmail.com'));
    await run(resetPassword('monica@gmail.com', MOCK_RESET_CODE, 'NuevaClave1'));

    expect((await run(signIn('monica@gmail.com', 'NuevaClave1'))).role).toBe('residente');
  });

  it('no envía códigos a correos inexistentes', async () => {
    await expectAuthError(requestPasswordReset('nadie@convive.com'), 'not_found');
  });
});

describe('changePassword (RF17)', () => {
  it('cambia la contraseña: la nueva sirve para entrar y la anterior ya no', async () => {
    await run(changePassword('monica@gmail.com', 'Residente123', 'NuevaClave1'));
    expect((await run(signIn('monica@gmail.com', 'NuevaClave1'))).role).toBe('residente');
    await expectAuthError(signIn('monica@gmail.com', 'Residente123'), 'invalid_credentials');
  });

  it('MSG-RF17-02: rechaza una contraseña actual incorrecta', async () => {
    await expectAuthError(changePassword('monica@gmail.com', 'Equivocada1', 'NuevaClave1'), 'wrong_password');
  });

  it('MSG-RF17-04: rechaza una nueva contraseña igual a la actual', async () => {
    await expectAuthError(changePassword('monica@gmail.com', 'Residente123', 'Residente123'), 'same_password');
  });

  it('MSG-RF17-05: rechaza una contraseña que no cumple las reglas (el servicio no confía en la pantalla)', async () => {
    await expectAuthError(changePassword('monica@gmail.com', 'Residente123', 'corta'), 'weak_password');
  });
});

describe('updatePhone (RF16)', () => {
  it('guarda el teléfono con formato y devuelve el usuario actualizado', async () => {
    const user = await run(updatePhone('monica@gmail.com', '3001112233'));
    expect(user.phone).toBe('300 111 2233');
    expect((await run(signIn('monica@gmail.com', 'Residente123'))).phone).toBe('300 111 2233');
  });

  it('MSG-RF16-02: rechaza un teléfono que no es un celular de 10 dígitos que empiece por 3', async () => {
    await expectAuthError(updatePhone('monica@gmail.com', '2111234567'), 'invalid_phone');
  });
});

describe('signOut', () => {
  it('se resuelve sin errores', async () => {
    await expect(run(signOut())).resolves.toBeUndefined();
  });
});

it('AuthError expone el código del error', () => {
  const error = new AuthError('invalid_credentials', 3);
  expect(error).toBeInstanceOf(Error);
  expect(error.code).toBe('invalid_credentials');
  expect(error.remainingAttempts).toBe(3);
});
