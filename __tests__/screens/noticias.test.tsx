import { act, fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { deleteNews, mockNewsNotifications } from '@/services/news.service';
import { formatDateTime, formatTime } from '@/utils/date';

import { navigate, press, pressDialogButton, renderSignedIn } from '../helpers/app';

// Comunicados de ejemplo (servicio simulado), del más reciente al más antiguo, publicados por David
// Muñoz. «Piscina cerrada este fin de semana» fue visible hasta el lunes 2 de noviembre a las 6:00 a. m.
// (11:00 UTC): ya venció, así que no sale en Inicio pero sí en el histórico.
const SEED_TITLES = ['Mantenimiento de ascensor', 'Asamblea general', 'Cambio horario piscina'];
const ALL_TITLES = ['Mantenimiento de ascensor', 'Piscina cerrada este fin de semana', 'Asamblea general', 'Cambio horario piscina'];
// «Ahora»: lunes 2 de noviembre de 2026, 15:30 UTC.
const NOW = new Date('2026-11-02T15:30:00.000Z');

beforeEach(() => jest.setSystemTime(NOW));

const admin: User = {
  id: 'u2',
  name: 'David Muñoz',
  initials: 'DM',
  email: 'admin@convive.com',
  phone: '',
  house: 'Administración',
  address: '',
  complex: '',
  role: 'administrador',
};

const titleField = () => screen.getByLabelText('Título');
const bodyField = () => screen.getByLabelText('Mensaje');
/** Títulos de las filas, en el orden en que se muestran. */
const rowTitles = (prefix: string) =>
  screen.getAllByRole('button', { name: new RegExp(`^${prefix} `) }).map((row) => row.props.accessibilityLabel.slice(prefix.length + 1));

async function signInAsAdmin() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  jest.setSystemTime(NOW);
  return app;
}

async function openAdminList() {
  const app = await signInAsAdmin();
  await press(screen.getByRole('button', { name: 'Ver comunicados' }));
  expect(app.getPathname()).toBe('/gestion-noticias');
  return app;
}

async function fill(title: string, body: string) {
  await fireEvent.changeText(titleField(), title);
  await fireEvent.changeText(bodyField(), body);
}

describe('RF19 · Últimas noticias en Inicio', () => {
  it('el residente ve los comunicados del conjunto, del más reciente al más antiguo', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');
    expect(app.getPathname()).toBe('/inicio');

    expect(rowTitles('Leer')).toEqual(SEED_TITLES);
  });

  it('al tocar un comunicado abre su detalle con quién lo publicó y el mensaje completo', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByRole('button', { name: 'Leer Asamblea general' }));

    expect(app.getPathname()).toBe('/noticias/n-2');
    expect(screen.getByRole('header', { name: 'Asamblea general' })).toBeTruthy();
    expect(screen.getByText(/^Publicado por David Muñoz · /)).toBeTruthy();
    expect(screen.getByText(/asamblea general de propietarios el sábado 14 de noviembre/)).toBeTruthy();
    expect(screen.queryByText(/^Editado el/)).toBeNull();
  });

  it('el detalle es una ventana que se cierra con «✕» o tocando fuera y vuelve a Inicio', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByRole('button', { name: 'Leer Asamblea general' }));
    await press(screen.getByRole('button', { name: 'Cerrar' }));
    expect(app.getPathname()).toBe('/inicio');

    await press(screen.getByRole('button', { name: 'Leer Cambio horario piscina' }));
    const closeTargets = screen.getAllByLabelText('Cerrar');
    // El fondo oscuro también cierra la ventana.
    await press(closeTargets[0]);
    expect(app.getPathname()).toBe('/inicio');
  });

  it('si se abre directo (p. ej. desde la notificación), al cerrar va a Inicio', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');
    await navigate({ pathname: '/noticias/[id]', params: { id: 'n-1' } });

    await press(screen.getByRole('button', { name: 'Cerrar' }));

    expect(app.getPathname()).toBe('/inicio');
  });

  it('muestra un mensaje cuando no hay comunicados vigentes', async () => {
    await signInAsAdmin();
    for (const id of ['n-1', 'n-2', 'n-3']) {
      await act(() => deleteNews(id, admin));
    }

    await navigate('/inicio');

    expect(screen.getByText(MSG.RF19.emptyActive)).toBeTruthy();
  });

  it('un comunicado que ya no existe muestra un aviso en lugar del detalle', async () => {
    await renderSignedIn('monica@gmail.com', 'Residente123');

    await navigate({ pathname: '/noticias/[id]', params: { id: 'no-existe' } });

    expect(screen.getByText(MSG.RF19.notFound)).toBeTruthy();
  });

  it.each([
    ['monica@gmail.com', 'Residente123'],
    ['junta@convive.com', 'Junta123'],
    ['vigilancia@convive.com', 'Vigilancia123'],
  ])('%s no puede abrir la gestión de comunicados', async (email, password) => {
    const app = await renderSignedIn(email, password);

    await navigate('/gestion-noticias');
    expect(app.getPathname()).not.toBe('/gestion-noticias');

    await navigate('/gestion-noticias/nuevo');
    expect(app.getPathname()).not.toBe('/gestion-noticias/nuevo');
  });
});

describe('RF19 · Publicar (administrador)', () => {
  it('«Publicar comunicado» del Panel abre el formulario; el botón se habilita con título y mensaje', async () => {
    const app = await signInAsAdmin();

    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));

    expect(app.getPathname()).toBe('/gestion-noticias/nuevo');
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    await fill('Corte de agua', 'Mañana no habrá agua de 8 a 10.');
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  it('publica el comunicado, avisa a las demás personas y aparece primero en Inicio', async () => {
    const app = await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));

    await fill('  Corte de agua programado ', 'Mañana no habrá agua de 8:00 a 10:00 a. m. por arreglos en el tanque.');
    await press(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByText(MSG.RF19.published)).toBeTruthy();
    expect(app.getPathname()).toBe('/panel');
    // Aviso «Nuevo comunicado» para todos menos quien lo publicó (RF09 lo envía como push).
    const notifications = mockNewsNotifications();
    expect(notifications.map((item) => item.recipientId)).toEqual(['u1', 'u3', 'u4', 'u5']);
    expect(notifications[0]).toMatchObject({ title: 'Nuevo comunicado', message: 'Corte de agua programado' });

    await navigate('/inicio');
    // Inicio muestra solo los 3 más recientes.
    expect(rowTitles('Leer')).toEqual(['Corte de agua programado', 'Mantenimiento de ascensor', 'Asamblea general']);
  });

  it('valida el título (5 a 60) y el mensaje (10 a 2.000) al salir de cada campo', async () => {
    await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));

    await fireEvent.changeText(titleField(), 'Agua');
    await fireEvent(titleField(), 'blur');
    expect(screen.getByText(MSG.RF19.titleInvalid)).toBeTruthy();

    await fireEvent.changeText(bodyField(), 'Corto');
    await fireEvent(bodyField(), 'blur');
    expect(screen.getByText(MSG.RF19.bodyInvalid)).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Publicar' }));
    expect(screen.queryByText(MSG.RF19.published)).toBeNull();
    expect(mockNewsNotifications()).toEqual([]);

    // Al corregir el campo, el mensaje desaparece.
    await fireEvent.changeText(titleField(), 'Corte de agua');
    expect(screen.queryByText(MSG.RF19.titleInvalid)).toBeNull();
  });

  it('el título muestra su contador hasta 60 caracteres', async () => {
    await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));

    await fireEvent.changeText(titleField(), 'Corte de agua');

    expect(screen.getByText('13/60')).toBeTruthy();
    expect(titleField().props.maxLength).toBe(60);
  });

  it('al cancelar con datos pide confirmación antes de descartarlos', async () => {
    const app = await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));
    await fireEvent.changeText(titleField(), 'Corte de agua');

    await press(screen.getByLabelText('Cancelar'));
    expect(screen.getByText(MSG.RF19.discardTitle)).toBeTruthy();
    await pressDialogButton('Seguir editando');
    expect(app.getPathname()).toBe('/gestion-noticias/nuevo');

    await press(screen.getByLabelText('Cancelar'));
    await pressDialogButton('Descartar');
    expect(app.getPathname()).toBe('/panel');
  });
});

describe('RF19 · Vigencia e histórico', () => {
  /** Elige «Visible hasta»: el día en el calendario y la hora en punto. */
  async function chooseVisibleUntil(day: number, hour?: number) {
    await press(screen.getByRole('button', { name: 'Visible hasta' }));
    await press(screen.getByLabelText(`${day} de Nov de 2026`));
    if (hour === undefined) return;
    await press(screen.getByRole('button', { name: 'Hora' }));
    await press(screen.getByRole('button', { name: formatTime(new Date(2000, 0, 1, hour)) }));
  }

  it('«Histórico de noticias» muestra todos, también los vencidos, y cualquiera los puede abrir', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');
    // El vencido no sale en Inicio.
    expect(screen.queryByRole('button', { name: 'Leer Piscina cerrada este fin de semana' })).toBeNull();

    await press(screen.getByRole('button', { name: 'Histórico de noticias' }));

    expect(app.getPathname()).toBe('/noticias');
    expect(rowTitles('Leer')).toEqual(ALL_TITLES);
    expect(screen.getAllByText('Vencido')).toHaveLength(1);

    await press(screen.getByRole('button', { name: 'Leer Piscina cerrada este fin de semana' }));
    expect(screen.getByRole('header', { name: 'Piscina cerrada este fin de semana' })).toBeTruthy();
    expect(screen.getByText(`Venció el ${formatDateTime(new Date('2026-11-02T11:00:00.000Z'))}`)).toBeTruthy();
  });

  it('publica con «visible hasta»: sale en Inicio y, al pasar esa hora, solo queda en el histórico', async () => {
    await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));
    expect(screen.getByRole('button', { name: 'Hora' })).toBeDisabled();

    await fill('Piscina cerrada el sábado', 'El sábado 7 de noviembre la piscina estará cerrada por mantenimiento.');
    await chooseVisibleUntil(9, 6);
    await press(screen.getByRole('button', { name: 'Publicar' }));
    expect(screen.getByText(MSG.RF19.published)).toBeTruthy();

    const until = formatDateTime(new Date(2026, 10, 9, 6));
    await navigate('/inicio');
    expect(rowTitles('Leer')[0]).toBe('Piscina cerrada el sábado');
    expect(screen.getByText(`Visible hasta ${until}`)).toBeTruthy();

    // Pasa la hora: nadie lo elimina, pero ya no sale en Inicio.
    jest.setSystemTime(new Date(2026, 10, 9, 6, 1));
    await navigate('/pqrs');
    await navigate('/inicio');
    expect(rowTitles('Leer')).not.toContain('Piscina cerrada el sábado');

    await navigate('/noticias');
    expect(rowTitles('Leer')[0]).toBe('Piscina cerrada el sábado');
  });

  it('con fecha pero sin hora, pide la hora', async () => {
    await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));
    await fill('Corte de agua', 'Mañana no habrá agua de 8 a 10.');

    await chooseVisibleUntil(9);
    await press(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByText(MSG.RF19.visibleUntilHourRequired)).toBeTruthy();
    expect(screen.queryByText(MSG.RF19.published)).toBeNull();
  });

  it('una hora que ya pasó no se acepta', async () => {
    await signInAsAdmin();
    await press(screen.getByRole('button', { name: 'Publicar comunicado' }));
    await fill('Corte de agua', 'Mañana no habrá agua de 8 a 10.');

    // Hoy (2 de noviembre) a las 12:00 a. m. ya pasó.
    await chooseVisibleUntil(2, 0);
    await press(screen.getByRole('button', { name: 'Publicar' }));

    expect(screen.getByText(MSG.RF19.visibleUntilPast)).toBeTruthy();
  });

  it('«Quitar fecha» deja el comunicado sin vencimiento; al editar uno vencido vuelve a Inicio', async () => {
    const app = await openAdminList();
    await press(screen.getByRole('button', { name: 'Editar Piscina cerrada este fin de semana' }));
    expect(screen.getByRole('button', { name: 'Visible hasta' })).toHaveAccessibilityValue({ text: '02/11/2026' });

    await press(screen.getByRole('link', { name: 'Quitar fecha' }));
    expect(screen.getByRole('button', { name: 'Visible hasta' })).toHaveAccessibilityValue({ text: 'Sin fecha' });
    await press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText(MSG.RF19.updated)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-noticias');
    expect(screen.queryByText('Vencido')).toBeNull();
    await navigate('/inicio');
    expect(rowTitles('Leer')).toContain('Piscina cerrada este fin de semana');
  });
});

describe('RF19 · Editar y eliminar (administrador)', () => {
  it('«Ver comunicados» lista todos los comunicados del conjunto', async () => {
    await openAdminList();

    // También los vencidos, para poder reutilizarlos o eliminarlos.
    expect(rowTitles('Editar')).toEqual(ALL_TITLES);
    expect(screen.getByText('Vencido')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar comunicado' })).toBeTruthy();
  });

  it('edita el título y el mensaje; el detalle muestra que fue editado', async () => {
    const app = await openAdminList();
    await press(screen.getByRole('button', { name: 'Editar Asamblea general' }));
    expect(app.getPathname()).toBe('/gestion-noticias/n-2');
    expect(titleField().props.value).toBe('Asamblea general');

    await fill('Asamblea general ordinaria', 'La asamblea será el sábado 14 de noviembre a las 10:00 a. m.');
    await press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText(MSG.RF19.updated)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-noticias');
    expect(rowTitles('Editar')).toEqual(['Mantenimiento de ascensor', 'Piscina cerrada este fin de semana', 'Asamblea general ordinaria', 'Cambio horario piscina']);

    await navigate({ pathname: '/noticias/[id]', params: { id: 'n-2' } });
    expect(screen.getByRole('header', { name: 'Asamblea general ordinaria' })).toBeTruthy();
    expect(screen.getByText(/10:00 a\. m\./)).toBeTruthy();
    expect(screen.getByText(/^Editado el /)).toBeTruthy();
  });

  it('elimina el comunicado después de confirmar', async () => {
    const app = await openAdminList();
    await press(screen.getByRole('button', { name: 'Editar Cambio horario piscina' }));

    await press(screen.getByRole('button', { name: 'Eliminar comunicado' }));
    expect(screen.getByText(MSG.RF19.deleteTitle)).toBeTruthy();
    await pressDialogButton('Cancelar');
    expect(app.getPathname()).toBe('/gestion-noticias/n-3');

    await press(screen.getByRole('button', { name: 'Eliminar comunicado' }));
    await pressDialogButton('Eliminar');

    expect(screen.getByText(MSG.RF19.deleted)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-noticias');
    expect(rowTitles('Editar')).toEqual(['Mantenimiento de ascensor', 'Piscina cerrada este fin de semana', 'Asamblea general']);
  });

  it('si otra persona eliminó el comunicado mientras se editaba, avisa que ya no está disponible', async () => {
    await openAdminList();
    await press(screen.getByRole('button', { name: 'Editar Asamblea general' }));

    await act(() => deleteNews('n-2', admin));
    await fill('Asamblea general', 'La asamblea será el sábado 14 de noviembre.');
    await press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText(MSG.RF19.notFound)).toBeTruthy();
    expect(screen.queryByText(MSG.RF19.updated)).toBeNull();
  });
});
