import { act, fireEvent, screen, within } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';
import type { User } from '@/services/auth.service';
import { createReservation, resetMockReservationsState } from '@/services/reservations.service';

import { press, pressDialogButton, renderSignedIn } from '../helpers/app';

// «Hoy» fijo: jueves 15 de octubre de 2026, 10:30 a. m. Las reservas de ejemplo del servicio simulado
// se cuentan desde hoy: Cancha el 16 (08:00–10:00) y sin cupo el 18; BBQ el 16 (12:00–16:00) y
// Salón social el 17 (18:00–22:00). Se usan días del 15 al 26, que no se repiten con los de septiembre.
const TODAY = new Date(2026, 9, 15, 10, 30);

const agendar = () => screen.getByRole('button', { name: 'Agendar reserva' });
const dayButton = (day: number, month = 'Oct', year = 2026) => screen.getByLabelText(`${day} de ${month} de ${year}`);

async function openReservas() {
  const app = await renderSignedIn('monica@gmail.com', 'Residente123');
  jest.setSystemTime(TODAY);
  resetMockReservationsState();
  await press(screen.getByText('Reservar zona'));
  expect(app.getPathname()).toBe('/reservas');
  return app;
}

async function chooseHour(field: 'Hora inicio' | 'Hora fin', hour: string) {
  await press(screen.getByRole('button', { name: field }));
  await press(screen.getByRole('button', { name: hour }));
}

/** Horas que ofrece la lista de un selector: sus opciones son botones con la hora como nombre. */
async function hoursOf(field: 'Hora inicio' | 'Hora fin'): Promise<string[]> {
  await press(screen.getByRole('button', { name: field }));
  const hours = screen
    .queryAllByRole('button', { name: /^\d{2}:00$/ })
    .map((option) => within(option).getByText(/^\d{2}:00$/).props.children as string);
  const closeButtons = screen.getAllByLabelText('Cerrar');
  await press(closeButtons[closeButtons.length - 1]);
  return hours;
}

async function fillCancha(day: number, start: string, end: string) {
  await press(screen.getByText('Cancha'));
  await press(screen.getByText(String(day)));
  await chooseHour('Hora inicio', start);
  await chooseHour('Hora fin', end);
}

describe('RF05 · Reservas · catálogo y calendario', () => {
  it('muestra las zonas del catálogo y deshabilita «Agendar reserva» hasta tener zona, fecha y horario', async () => {
    await openReservas();

    expect(screen.getByText('Salón social')).toBeTruthy();
    expect(screen.getByText('Cancha')).toBeTruthy();
    expect(screen.getByText('BBQ')).toBeTruthy();
    expect(agendar()).toBeDisabled();

    await press(screen.getByText('Cancha'));
    expect(agendar()).toBeDisabled();
    await press(screen.getByText('20'));
    expect(agendar()).toBeDisabled();
    await chooseHour('Hora inicio', '10:00');
    expect(agendar()).toBeDisabled();
    await chooseHour('Hora fin', '12:00');
    expect(agendar()).toBeEnabled();
  });

  it('los días pasados se ven en gris y no se pueden elegir', async () => {
    await openReservas();

    expect(dayButton(14)).toBeDisabled();
    expect(dayButton(15)).toBeEnabled();
    expect(dayButton(16)).toBeEnabled();
  });

  it('navega desde el mes actual hasta 3 meses adelante', async () => {
    await openReservas();

    expect(screen.getByLabelText('Mes anterior')).toBeDisabled();
    for (let i = 0; i < 3; i++) {
      await press(screen.getByLabelText('Mes siguiente'));
    }
    expect(screen.getByText('Ene')).toBeTruthy();
    expect(screen.getByText('2027')).toBeTruthy();
    expect(screen.getByLabelText('Mes siguiente')).toBeDisabled();
    expect(dayButton(31, 'Ene', 2027)).toBeEnabled();
  });

  it('pide elegir una zona si se toca un día primero (MSG-RF05-04)', async () => {
    await openReservas();

    await press(screen.getByText('20'));
    expect(screen.getByText(MSG.RF05.zoneRequired)).toBeTruthy();

    await press(screen.getByText('Cancha'));
    expect(screen.queryByText(MSG.RF05.zoneRequired)).toBeNull();
  });

  it('al elegir la zona, los días sin cupo se ven en gris', async () => {
    await openReservas();

    expect(dayButton(18)).toBeEnabled();
    await press(screen.getByText('Cancha'));
    expect(dayButton(18)).toBeDisabled();
    expect(dayButton(17)).toBeEnabled();

    // La disponibilidad se recarga al cambiar de zona: el BBQ sí tiene cupo ese día.
    await press(screen.getByText('BBQ'));
    expect(dayButton(18)).toBeEnabled();
  });
});

describe('RF05 · Reservas · franja horaria y asistentes', () => {
  it('solo ofrece franjas libres dentro del horario de la zona, en bloques de 1 hora', async () => {
    await openReservas();
    await press(screen.getByText('Cancha'));
    await press(screen.getByText('16'));

    // Cancha: 06:00 a 22:00; el 16 está ocupada de 08:00 a 10:00.
    const starts = await hoursOf('Hora inicio');
    expect(starts[0]).toBe('06:00');
    expect(starts).not.toContain('08:00');
    expect(starts).not.toContain('09:00');
    expect(starts).toContain('10:00');
    expect(starts[starts.length - 1]).toBe('21:00');

    // Desde las 06:00 la reserva solo puede llegar hasta la franja ocupada.
    await chooseHour('Hora inicio', '06:00');
    expect(await hoursOf('Hora fin')).toEqual(['07:00', '08:00']);
  });

  it('hoy solo ofrece las franjas que aún no empiezan', async () => {
    await openReservas();
    await press(screen.getByText('Cancha'));
    await press(screen.getByText('15'));

    const starts = await hoursOf('Hora inicio');
    expect(starts[0]).toBe('11:00');
    expect(starts).not.toContain('10:00');
  });

  it('si la hora inicial queda después de la final, la quita y avisa (MSG-RF05-05)', async () => {
    await openReservas();
    await fillCancha(20, '10:00', '12:00');

    await chooseHour('Hora inicio', '14:00');

    expect(screen.getByText(MSG.RF05.endBeforeStart)).toBeTruthy();
    expect(agendar()).toBeDisabled();
  });

  it('valida el número de asistentes contra el aforo (MSG-RF05-07)', async () => {
    await openReservas();
    await fillCancha(20, '10:00', '12:00');

    const field = screen.getByLabelText('Número de asistentes (opcional)');
    await fireEvent.changeText(field, '13');
    await fireEvent(field, 'blur');
    expect(screen.getByText(MSG.RF05.overCapacity('Cancha', 12))).toBeTruthy();

    // Con el error, «Agendar reserva» no abre la confirmación.
    await press(agendar());
    expect(screen.queryByText(MSG.RF05.confirmTitle)).toBeNull();

    await fireEvent.changeText(field, '12');
    await fireEvent(field, 'blur');
    expect(screen.queryByText(MSG.RF05.overCapacity('Cancha', 12))).toBeNull();
  });

  it('el número de asistentes solo admite dígitos y al menos 1', async () => {
    await openReservas();
    await press(screen.getByText('Cancha'));

    const field = screen.getByLabelText('Número de asistentes (opcional)');
    await fireEvent.changeText(field, '1a2');
    expect(field.props.value).toBe('12');

    await fireEvent.changeText(field, '0');
    await fireEvent(field, 'blur');
    expect(screen.getByText(MSG.RF05.attendeesInvalid)).toBeTruthy();
  });
});

describe('RF05 · Reservas · cambio de zona', () => {
  it('si el día elegido no tiene cupo en la nueva zona, lo quita y avisa (MSG-RF05-08)', async () => {
    await openReservas();
    await press(screen.getByText('BBQ'));
    await press(screen.getByText('18'));

    await press(screen.getByText('Cancha'));

    expect(screen.getByTestId('toast-info')).toHaveTextContent(MSG.RF05.dayFull);
    expect(dayButton(18)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hora inicio' })).toBeDisabled();
  });

  it('si el horario queda fuera del permitido en la nueva zona, lo quita y avisa (MSG-RF05-06)', async () => {
    await openReservas();
    await fillCancha(20, '06:00', '07:00');

    await press(screen.getByText('BBQ'));

    expect(screen.getByText(MSG.RF05.outsideSchedule('10:00', '20:00'))).toBeTruthy();
    expect(agendar()).toBeDisabled();
  });
});

describe('RF05 · Reservas · confirmación', () => {
  it('confirma la reserva de una zona sin aprobación (MSG-RF05-01 y MSG-RF05-02)', async () => {
    await openReservas();
    await fillCancha(20, '10:00', '12:00');
    await fireEvent.changeText(screen.getByLabelText('Número de asistentes (opcional)'), '8');

    await press(agendar());
    expect(screen.getByText(MSG.RF05.confirmTitle)).toBeTruthy();
    expect(screen.getByText('Cancha · 20/10/2026 · 10:00 – 12:00')).toBeTruthy();

    await pressDialogButton('Confirmar');

    expect(screen.getByTestId('toast-success')).toHaveTextContent(
      '¡Reserva confirmada! Cancha el 20/10/2026 de 10:00 a 12:00.',
    );
    // El formulario queda listo para otra reserva y esa franja ya no se ofrece.
    expect(agendar()).toBeDisabled();
    await press(screen.getByText('20'));
    const starts = await hoursOf('Hora inicio');
    expect(starts).not.toContain('10:00');
    expect(starts).not.toContain('11:00');
  });

  it('«Cancelar» cierra la confirmación sin guardar', async () => {
    await openReservas();
    await fillCancha(20, '10:00', '12:00');

    await press(agendar());
    await pressDialogButton('Cancelar');

    expect(screen.queryByTestId('toast-success')).toBeNull();
    expect(agendar()).toBeEnabled();
  });

  it('si la zona requiere aprobación, avisa que la solicitud fue enviada (MSG-RF05-03)', async () => {
    await openReservas();
    await press(screen.getByText('Salón social'));
    await press(screen.getByText('20'));
    await chooseHour('Hora inicio', '18:00');
    await chooseHour('Hora fin', '20:00');

    await press(agendar());
    await pressDialogButton('Confirmar');

    expect(screen.getByText(MSG.RF05.pendingApproval)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
    await pressDialogButton('Aceptar');
    expect(screen.queryByText(MSG.RF05.pendingApproval)).toBeNull();
  });

  it('si otra persona tomó la franja mientras confirmaba, lo valida el servidor y la quita', async () => {
    await openReservas();
    await fillCancha(20, '10:00', '12:00');

    // Otra unidad reserva de 11:00 a 13:00 el mismo día.
    const neighbor: User = {
      id: 'u9',
      name: 'Vecino',
      initials: 'VE',
      email: 'vecino@convive.com',
      phone: '',
      house: '12',
      address: '',
      complex: '',
      role: 'residente',
    };
    await act(() =>
      createReservation({ zoneId: 'zona-cancha', date: '2026-10-20', start: 11, end: 13, attendees: null }, neighbor),
    );

    await press(agendar());
    await pressDialogButton('Confirmar');

    expect(screen.getByText(MSG.RF05.slotTaken)).toBeTruthy();
    expect(screen.queryByTestId('toast-success')).toBeNull();
    expect(agendar()).toBeDisabled();
  });
});
