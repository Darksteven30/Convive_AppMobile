import { act, fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { changePqrsStatus, createPqrs, getPqrsDetail, mockNotifications } from '@/services/pqrs.service';

import { navigate, press, renderSignedIn } from '../helpers/app';

// PQRS de ejemplo (servicio simulado): #0001 Reclamo resuelto, #0002 Queja en proceso y
// #0003 Reporte de daño pendiente, todas de Monica Galvis (unidad 56).
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
const owner: User = { ...admin, id: 'u1', name: 'Monica Galvis', initials: 'MG', email: 'monica@gmail.com', house: '56', role: 'residente' };

const guardar = () => screen.getByRole('button', { name: 'Guardar' });

async function openList() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  await press(screen.getByRole('button', { name: 'Ver PQRS' }));
  expect(app.getPathname()).toBe('/gestion-pqrs');
  return app;
}

async function openDetail(code: string) {
  const app = await openList();
  await press(screen.getByRole('button', { name: `Atender ${code}` }));
  return app;
}

/** Opciones que muestra el selector «Estado» (y lo cierra). */
async function statusOptions(): Promise<string[]> {
  await press(screen.getByRole('button', { name: 'Estado' }));
  const labels = ['Pendiente', 'En proceso', 'Resuelto'].filter(
    (label) => screen.queryAllByRole('button', { name: label }).length > 0,
  );
  const closeButtons = screen.getAllByLabelText('Cerrar');
  await press(closeButtons[closeButtons.length - 1]);
  return labels;
}

async function chooseStatus(label: string) {
  await press(screen.getByRole('button', { name: 'Estado' }));
  await press(screen.getByRole('button', { name: label }));
}

describe('RF08 · acceso', () => {
  it('«Ver PQRS» del Panel abre las PQRS del conjunto, no la vista del residente', async () => {
    await openList();

    expect(screen.getByText('PQRS del conjunto')).toBeTruthy();
    const titles = screen.getAllByText(/^#\d{4} — /).map((node) => node.props.children.join(''));
    expect(titles).toEqual(['#0003 — Reporte de daño', '#0002 — Queja', '#0001 — Reclamo']);
    expect(screen.getAllByText('Monica Galvis · Unidad 56')).toHaveLength(3);
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText('En proceso')).toBeTruthy();
    expect(screen.getByText('Resuelto')).toBeTruthy();
    // No es el formulario de radicar del residente.
    expect(screen.queryByText('Nueva PQRS')).toBeNull();
  });

  it('para el administrador, la pestaña PQRS abre las PQRS del conjunto', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');

    await press(screen.getByRole('button', { name: 'PQRS' }));

    expect(app.getPathname()).toBe('/gestion-pqrs');
    expect(screen.getByRole('button', { name: 'PQRS' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Atender #0003' })).toBeTruthy();
    expect(screen.queryByText('Nueva PQRS')).toBeNull();
  });

  it('para el residente, la pestaña PQRS sigue abriendo su lista y el formulario para radicar', async () => {
    const app = await renderSignedIn('monica@gmail.com', 'Residente123');

    await press(screen.getByRole('button', { name: 'PQRS' }));

    expect(app.getPathname()).toBe('/pqrs');
    expect(screen.getByText('Nueva PQRS')).toBeTruthy();
  });

  it.each([
    ['monica@gmail.com', 'Residente123'],
    ['junta@convive.com', 'Junta123'],
    ['vigilancia@convive.com', 'Vigilancia123'],
  ])('%s no puede abrir las PQRS del conjunto', async (email, password) => {
    const app = await renderSignedIn(email, password);

    await navigate('/gestion-pqrs');
    expect(app.getPathname()).not.toBe('/gestion-pqrs');
    await navigate({ pathname: '/gestion-pqrs/[id]', params: { id: 'pq-3' } });
    expect(app.getPathname()).not.toBe('/gestion-pqrs/pq-3');
  });
});

describe('RF08 · detalle', () => {
  it('muestra radicado, tipo, descripción, quién la radicó y las fotos ampliables', async () => {
    const app = await renderSignedIn('admin@convive.com', 'Admin123');
    await act(() =>
      createPqrs(
        {
          type: 'reporte_dano',
          description: 'La baranda de la escalera de la torre 2 está suelta.',
          photos: [{ uri: 'file:///fotos/baranda.jpg', mimeType: 'image/jpeg', size: 1000 }],
        },
        owner,
      ),
    );
    await press(screen.getByRole('button', { name: 'Ver PQRS' }));
    await press(screen.getByRole('button', { name: 'Atender #0004' }));

    expect(app.getPathname()).toBe('/gestion-pqrs/pq-new-1');
    expect(screen.getByText('PQRS #0004')).toBeTruthy();
    expect(screen.getByText('Reporte de daño')).toBeTruthy();
    expect(screen.getByText('La baranda de la escalera de la torre 2 está suelta.')).toBeTruthy();
    expect(screen.getByText('Monica Galvis · Unidad 56')).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Ampliar foto 1' }));
    expect(screen.getByText('Foto 1 de 1')).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Cerrar foto' }));
  });
});

describe('RF08 · cambio de estado', () => {
  it('desde «Pendiente» solo ofrece «En proceso» y guarda sin comentario (MSG-RF08-01)', async () => {
    await openDetail('#0003');

    expect(screen.getByText('Estado actual: Pendiente')).toBeTruthy();
    expect(await statusOptions()).toEqual(['En proceso']);
    expect(guardar()).toBeDisabled();

    await chooseStatus('En proceso');
    expect(guardar()).toBeEnabled();
    await press(guardar());

    expect(screen.getByTestId('toast-success')).toHaveTextContent(MSG.RF08.updated);
    expect(screen.getByText('Estado actual: En proceso')).toBeTruthy();
    // Queda en el historial con quién lo hizo.
    expect(screen.getByText('David Muñoz')).toBeTruthy();
    expect(screen.getByText('Cambió el estado a En proceso.')).toBeTruthy();
    // Evento para la notificación al propietario (RF09).
    expect(mockNotifications()).toEqual([
      expect.objectContaining({ recipientId: 'u1', message: 'Tu solicitud #0003 ahora está «En proceso».' }),
    ]);
  });

  it('desde «En proceso» solo ofrece «Resuelto», que exige una respuesta (MSG-RF08-02)', async () => {
    await openDetail('#0002');

    expect(await statusOptions()).toEqual(['Resuelto']);
    await chooseStatus('Resuelto');
    expect(screen.getByText('Comentario / respuesta')).toBeTruthy();

    await press(guardar());
    expect(screen.getByText(MSG.RF08.commentRequired)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();

    const field = screen.getByLabelText('Comentario / respuesta');
    await fireEvent.changeText(field, 'Listo.');
    await fireEvent(field, 'blur');
    expect(screen.getByText(MSG.RF08.commentLength)).toBeTruthy();
    expect(field.props.maxLength).toBe(500);
  });

  it('al resolver, la respuesta queda en el historial que ve el propietario y el estado es final', async () => {
    await openDetail('#0002');
    const answer = 'Hablamos con la unidad y desde este fin de semana no hay más ruido.';

    await chooseStatus('Resuelto');
    await fireEvent.changeText(screen.getByLabelText('Comentario / respuesta'), answer);
    await press(guardar());

    expect(screen.getByTestId('toast-success')).toHaveTextContent(MSG.RF08.updated);
    expect(screen.getByText(answer)).toBeTruthy();
    expect(screen.getByText(MSG.RF08.finalStatus)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Estado' })).toBeNull();

    // El propietario ve la respuesta en su detalle.
    const forOwner = await act(() => getPqrsDetail('pq-2', owner));
    expect(forOwner.status).toBe('resuelto');
    expect(forOwner.responses[forOwner.responses.length - 1]).toMatchObject({ author: 'David Muñoz', message: answer });
  });

  it('una PQRS resuelta no admite más cambios', async () => {
    await openDetail('#0001');

    expect(screen.getByText(MSG.RF08.finalStatus)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });

  it('si otra persona ya cambió el estado, avisa que la transición no es posible (MSG-RF08-03)', async () => {
    await openDetail('#0003');
    await chooseStatus('En proceso');

    // Otro administrador la pasa a «En proceso» mientras tanto.
    await act(() => changePqrsStatus({ pqrsId: 'pq-3', currentStatus: 'pendiente', status: 'en_proceso', comment: '' }, admin));
    await press(guardar());

    expect(screen.getByText(MSG.RF08.invalidTransition('En proceso', 'En proceso'))).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
    // Se recarga con el estado actual y su única opción.
    expect(screen.getByText('Estado actual: En proceso')).toBeTruthy();
  });

  it('el comentario opcional de «En proceso» también queda en el historial', async () => {
    await openDetail('#0003');

    await chooseStatus('En proceso');
    await fireEvent.changeText(
      screen.getByLabelText('Comentario / respuesta (opcional)'),
      'El técnico revisa el portón el lunes.',
    );
    await press(guardar());

    expect(screen.getByText('El técnico revisa el portón el lunes.')).toBeTruthy();
  });
});

