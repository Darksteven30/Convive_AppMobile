import { act, fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import { TOAST_DURATION_MS } from '@/context/FeedbackContext';
import { MOCK_RESET_CODE } from '@/services/auth.service';

import { navigate, press, renderApp, renderSignedIn, submitEmail, submitPassword } from '../helpers/app';

afterEach(() => jest.useRealTimers());

const emailField = () => screen.getByLabelText('Correo electrónico');
const continuar = () => screen.getByRole('button', { name: 'Continuar' });

describe('RF01 · paso 1: correo', () => {
  it('sin sesión, la entrada a la app lleva al login', async () => {
    const app = await renderApp('/');
    expect(app.getPathname()).toBe('/sign-in');
    expect(screen.getByText('Inicia sesión')).toBeTruthy();
  });

  it('sin sesión, no se puede abrir una pantalla interna escribiendo la ruta', async () => {
    const app = await renderApp('/inicio');
    expect(app.getPathname()).not.toBe('/inicio');
    expect(screen.queryByText('Estado de la cuenta')).toBeNull();
  });

  it('«Continuar» está deshabilitado con el correo vacío o inválido', async () => {
    await renderApp('/');
    expect(continuar()).toBeDisabled();

    await fireEvent.changeText(emailField(), 'monica@');
    expect(continuar()).toBeDisabled();

    await fireEvent.changeText(emailField(), 'monica@gmail.com');
    expect(continuar()).toBeEnabled();
  });

  it('MSG-RF01-02: valida el formato al salir del campo', async () => {
    await renderApp('/');
    await fireEvent.changeText(emailField(), 'monica.gmail.com');
    await fireEvent(emailField(), 'blur');

    expect(screen.getByText(MSG.RF01.emailInvalid)).toBeTruthy();

    // El mensaje desaparece al corregir el dato.
    await fireEvent.changeText(emailField(), 'monica@gmail.com');
    expect(screen.queryByText(MSG.RF01.emailInvalid)).toBeNull();
  });

  it('MSG-RF01-01: avisa si el usuario borra el correo', async () => {
    await renderApp('/');
    await fireEvent.changeText(emailField(), 'm');
    await fireEvent.changeText(emailField(), '');
    await fireEvent(emailField(), 'blur');

    expect(screen.getByText(MSG.RF01.emailRequired)).toBeTruthy();
  });

  it('MSG-RF01-03: un correo no registrado muestra un diálogo y no avanza', async () => {
    const app = await renderApp('/');
    await submitEmail('desconocido@convive.com');

    expect(screen.getByText(MSG.RF01.emailNotRegistered)).toBeTruthy();
    expect(app.getPathname()).toBe('/sign-in');

    await press(screen.getByRole('button', { name: 'Aceptar' }));
    expect(screen.queryByText(MSG.RF01.emailNotRegistered)).toBeNull();
  });

  it('normaliza el correo (mayúsculas y espacios) y pasa a la pantalla de contraseña', async () => {
    const app = await renderApp('/');
    await submitEmail('  Monica@Gmail.COM ');

    expect(app.getPathname()).toBe('/contrasena');
    expect(screen.getByText('monica@gmail.com')).toBeTruthy();
  });

  it('un correo pre-registrado sin contraseña va a «Crea tu contraseña»', async () => {
    const app = await renderApp('/');
    await submitEmail('nuevo@convive.com');

    expect(app.getPathname()).toBe('/crear-contrasena');
    expect(screen.getByText('Crea tu contraseña')).toBeTruthy();
  });

  it('Google y Apple avisan que estarán disponibles próximamente', async () => {
    await renderApp('/');
    await press(screen.getByText('Continuar con Google'));

    expect(screen.getByText(MSG.RF01.socialUnavailable)).toBeTruthy();

    // El Toast se cierra solo a los 3 segundos.
    await act(() => jest.advanceTimersByTimeAsync(TOAST_DURATION_MS));
    expect(screen.queryByText(MSG.RF01.socialUnavailable)).toBeNull();
  });
});

describe('RF01 · paso 2: contraseña', () => {
  async function goToPassword(email = 'monica@gmail.com') {
    const app = await renderApp('/');
    await submitEmail(email);
    return app;
  }

  it('«Iniciar sesión» se habilita con al menos 8 caracteres', async () => {
    await goToPassword();
    const button = () => screen.getByRole('button', { name: 'Iniciar sesión' });

    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Corta12');
    expect(button()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'Larga123');
    expect(button()).toBeEnabled();
  });

  it('el ícono de ojo muestra y oculta la contraseña', async () => {
    await goToPassword();
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(true);

    await press(screen.getByLabelText('Mostrar contraseña'));
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(false);

    await press(screen.getByLabelText('Ocultar contraseña'));
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(true);
  });

  it('MSG-RF01-04: contraseña incorrecta indica los intentos restantes', async () => {
    const app = await goToPassword();

    await submitPassword('Incorrecta1');
    expect(screen.getByText(MSG.RF01.wrongPassword(4))).toBeTruthy();

    await submitPassword('Incorrecta2');
    expect(screen.getByText(MSG.RF01.wrongPassword(3))).toBeTruthy();
    expect(app.getPathname()).toBe('/contrasena');
  });

  it('MSG-RF01-05: al quinto intento fallido bloquea la cuenta 15 minutos', async () => {
    const app = await goToPassword();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await submitPassword(`Incorrecta${attempt}`);
    }
    expect(screen.getByText(MSG.RF01.accountLocked)).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Aceptar' }));

    // Durante el bloqueo ni la contraseña correcta permite entrar.
    await submitPassword('Residente123');
    expect(screen.getByText(MSG.RF01.accountLocked)).toBeTruthy();
    expect(app.getPathname()).toBe('/contrasena');
    await press(screen.getByRole('button', { name: 'Aceptar' }));

    // Pasados los 15 minutos, la cuenta se desbloquea.
    jest.setSystemTime(Date.now() + 15 * 60 * 1000);
    await submitPassword('Residente123');
    expect(app.getPathname()).toBe('/inicio');
  });

  it('desde el diálogo de bloqueo se puede ir a recuperar la contraseña', async () => {
    const app = await goToPassword();
    for (let attempt = 1; attempt <= 5; attempt++) {
      await submitPassword(`Incorrecta${attempt}`);
    }
    await press(screen.getByRole('button', { name: 'Recuperar contraseña' }));

    expect(app.getPathname()).toBe('/recuperar-contrasena');
    expect(screen.getByText(MSG.RF01.resetCodeSent('monica@gmail.com'))).toBeTruthy();
  });

  it('la flecha de volver regresa al paso del correo', async () => {
    const app = await goToPassword();
    await press(screen.getByLabelText('Volver'));
    expect(app.getPathname()).toBe('/sign-in');
  });
});

describe('RF01 · pantalla principal según el rol', () => {
  it.each([
    ['administrador', 'admin@convive.com', 'Admin123', '/panel', 'Panel de administración'],
    ['junta directiva', 'junta@convive.com', 'Junta123', '/general', 'Resumen financiero'],
    ['propietario', 'monica@gmail.com', 'Residente123', '/inicio', 'Últimas noticias'],
    ['vigilancia', 'vigilancia@convive.com', 'Vigilancia123', '/visitantes', 'Visitantes esperados hoy'],
  ])('%s entra a %s', async (_role, email, password, path, heading) => {
    const app = await renderSignedIn(email, password);

    expect(app.getPathname()).toBe(path);
    expect(screen.getByText(heading)).toBeTruthy();
  });
});

describe('RF01 · crear contraseña (cuenta pre-registrada)', () => {
  it('exige las reglas de seguridad y que la confirmación coincida; luego inicia sesión', async () => {
    const app = await renderApp('/');
    await submitEmail('nuevo@convive.com');
    const crear = () => screen.getByRole('button', { name: 'Crear contraseña' });

    await fireEvent.changeText(screen.getByLabelText('Nueva contraseña'), 'NuevaClave1');
    await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), 'NuevaClave2');
    expect(screen.getByText(MSG.RF01.passwordsDontMatch)).toBeTruthy();
    expect(crear()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), 'NuevaClave1');
    expect(screen.getByText('✓ Una mayúscula')).toBeTruthy();
    expect(crear()).toBeEnabled();

    await press(crear());
    expect(app.getPathname()).toBe('/inicio');
  });
});

describe('RF01 · recuperar contraseña', () => {
  async function goToRecovery() {
    const app = await renderApp('/');
    await submitEmail('monica@gmail.com');
    await press(screen.getByText('¿Olvidaste tu contraseña?'));
    return app;
  }

  async function fillRecovery(code: string) {
    await fireEvent.changeText(screen.getByLabelText('Código de verificación'), code);
    await fireEvent.changeText(screen.getByLabelText('Nueva contraseña'), 'NuevaClave1');
    await fireEvent.changeText(screen.getByLabelText('Confirmar contraseña'), 'NuevaClave1');
    await press(screen.getByRole('button', { name: 'Guardar contraseña' }));
  }

  it('MSG-RF01-07: envía el código y abre la pantalla de recuperación', async () => {
    const app = await goToRecovery();

    expect(app.getPathname()).toBe('/recuperar-contrasena');
    expect(screen.getByText(MSG.RF01.resetCodeSent('monica@gmail.com'))).toBeTruthy();
  });

  it('rechaza un código incorrecto', async () => {
    await goToRecovery();
    await fillRecovery('000000');

    expect(screen.getByText(MSG.RF01.resetCodeInvalid)).toBeTruthy();
  });

  it('el código vence a los 10 minutos', async () => {
    await goToRecovery();
    jest.setSystemTime(Date.now() + 10 * 60 * 1000 + 1);
    await fillRecovery(MOCK_RESET_CODE);

    expect(screen.getByText(MSG.RF01.resetCodeInvalid)).toBeTruthy();
  });

  it('con el código correcto cambia la contraseña y permite entrar con la nueva', async () => {
    const app = await goToRecovery();
    await fillRecovery(MOCK_RESET_CODE);

    expect(screen.getByText(MSG.RF01.passwordUpdated)).toBeTruthy();
    expect(app.getPathname()).toBe('/contrasena');

    await submitPassword('Residente123');
    expect(screen.getByText(MSG.RF01.wrongPassword(4))).toBeTruthy();

    await submitPassword('NuevaClave1');
    expect(app.getPathname()).toBe('/inicio');
  });
});

describe('RF01 · sesión', () => {
  it('con sesión activa no se puede volver al login', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await navigate('/sign-in');
    expect(app.getPathname()).not.toBe('/sign-in');
    expect(screen.queryByText('Inicia sesión')).toBeNull();
  });

  it('cerrar sesión regresa al login y bloquea de nuevo la app', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');

    await press(screen.getByLabelText('Ver perfil'));
    expect(app.getPathname()).toBe('/perfil');

    await press(screen.getByText('Cerrar sesión'));
    expect(app.getPathname()).toBe('/sign-in');

    await navigate('/inicio');
    expect(app.getPathname()).not.toBe('/inicio');
  });
});
