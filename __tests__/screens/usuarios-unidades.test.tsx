import { fireEvent, screen } from '@testing-library/react-native';

import { MSG } from '@/constants/messages';

import { navigate, press, pressDialogButton, renderSignedIn } from '../helpers/app';

// Datos de ejemplo (servicio simulado): 5 unidades (12, 56, 78, Administración y Portería) y 5
// personas; Laura Gómez (nuevo@convive.com, casa 78) está pre-registrada y aún no crea su cuenta.

const field = (label: string) => screen.getByLabelText(label);

async function openPeople() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  await press(screen.getByRole('button', { name: 'Personas' }));
  expect(app.getPathname()).toBe('/gestion-usuarios');
  return app;
}

async function openUnits() {
  const app = await renderSignedIn('admin@convive.com', 'Admin123');
  await press(screen.getByRole('button', { name: 'Unidades' }));
  expect(app.getPathname()).toBe('/gestion-unidades');
  return app;
}

async function choose(selectLabel: string, option: string) {
  await press(screen.getByRole('button', { name: selectLabel }));
  const options = screen.getAllByRole('button', { name: option });
  await press(options[options.length - 1]);
}

describe('RF20 · Personas', () => {
  it('lista a las personas del conjunto con su rol, su unidad y quién aún no crea su cuenta', async () => {
    await openPeople();

    expect(screen.getByText('5 personas · 1 sin crear su cuenta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar Laura Gómez' })).toBeTruthy();
    expect(screen.getByText('Sin cuenta')).toBeTruthy();
    expect(screen.getByText('Residente · Unidad 56')).toBeTruthy();
    expect(screen.getByText('Vigilancia · Unidad Portería')).toBeTruthy();
  });

  it('pre-registra a una persona con su rol y su unidad', async () => {
    const app = await openPeople();
    await press(screen.getByRole('button', { name: 'Pre-registrar persona' }));
    expect(app.getPathname()).toBe('/gestion-usuarios/nuevo');
    expect(screen.getByRole('button', { name: 'Pre-registrar' })).toBeDisabled();

    await fireEvent.changeText(field('Nombre completo'), 'Sofía Ramírez');
    await fireEvent.changeText(field('Correo electrónico'), 'Sofia@Correo.com');
    await fireEvent.changeText(field('Teléfono (opcional)'), '320 111 2233');
    await choose('Rol', 'Residente');
    await choose('Unidad', '78');
    await press(screen.getByRole('button', { name: 'Pre-registrar' }));

    expect(screen.getByText(MSG.RF20.personPreregistered('sofia@correo.com'))).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-usuarios');
    expect(screen.getByText('6 personas · 2 sin crear su cuenta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar Sofía Ramírez' })).toBeTruthy();
  });

  it('pide la unidad a un residente y no repite correos', async () => {
    await openPeople();
    await press(screen.getByRole('button', { name: 'Pre-registrar persona' }));
    await fireEvent.changeText(field('Nombre completo'), 'Sofía Ramírez');
    await fireEvent.changeText(field('Correo electrónico'), 'monica@gmail.com');
    await choose('Rol', 'Residente');

    await press(screen.getByRole('button', { name: 'Pre-registrar' }));
    expect(screen.getByText(MSG.RF20.unitRequired)).toBeTruthy();

    await choose('Unidad', '78');
    await press(screen.getByRole('button', { name: 'Pre-registrar' }));
    expect(screen.getByText(MSG.RF20.emailDuplicate)).toBeTruthy();
  });

  it('la vigilancia no necesita unidad', async () => {
    await openPeople();
    await press(screen.getByRole('button', { name: 'Pre-registrar persona' }));
    await fireEvent.changeText(field('Nombre completo'), 'Pedro Castro');
    await fireEvent.changeText(field('Correo electrónico'), 'pedro@convive.com');
    await choose('Rol', 'Vigilancia');

    expect(screen.getByRole('button', { name: 'Unidad (opcional)' })).toBeTruthy();
    await press(screen.getByRole('button', { name: 'Pre-registrar' }));
    expect(screen.getByText(MSG.RF20.personPreregistered('pedro@convive.com'))).toBeTruthy();
  });

  it('a quien ya creó su cuenta no se le cambia el correo ni se elimina, pero sí se editan sus datos', async () => {
    const app = await openPeople();
    await press(screen.getByRole('button', { name: 'Editar Monica Galvis' }));

    expect(field('Correo electrónico').props.editable).toBe(false);
    expect(screen.getByText(MSG.RF20.emailLocked)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Eliminar pre-registro' })).toBeNull();

    await choose('Unidad', '12');
    await press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText(MSG.RF20.personUpdated)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-usuarios');
    expect(screen.getAllByText('Residente · Unidad 12')).toHaveLength(1);
  });

  it('el administrador no puede cambiar su propio rol', async () => {
    await openPeople();
    await press(screen.getByRole('button', { name: 'Editar David Muñoz' }));

    await choose('Rol', 'Residente');
    await choose('Unidad', '56');
    await press(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(screen.getByText(MSG.RF20.ownRole)).toBeTruthy();
  });

  it('elimina un pre-registro después de confirmar', async () => {
    const app = await openPeople();
    await press(screen.getByRole('button', { name: 'Editar Laura Gómez' }));
    expect(field('Correo electrónico').props.editable).toBe(true);

    await press(screen.getByRole('button', { name: 'Eliminar pre-registro' }));
    expect(screen.getByText(MSG.RF20.deleteTitle)).toBeTruthy();
    await pressDialogButton('Eliminar');

    expect(screen.getByText(MSG.RF20.preregistrationDeleted)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-usuarios');
    expect(screen.queryByRole('button', { name: 'Editar Laura Gómez' })).toBeNull();
  });
});

describe('RF20 · Unidades', () => {
  it('lista las unidades con cuántas personas tiene cada una', async () => {
    await openUnits();

    expect(screen.getByText('5 unidades')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Editar unidad 56' })).toBeTruthy();
    expect(screen.getAllByText('1 persona')).toHaveLength(5);
  });

  it('crea una unidad y no permite repetir el nombre', async () => {
    const app = await openUnits();
    await press(screen.getByRole('button', { name: 'Nueva unidad' }));

    await fireEvent.changeText(field('Nombre de la unidad'), 'Torre 2 · 301');
    await fireEvent.changeText(field('Dirección (opcional)'), 'Apartamento 301');
    await press(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(MSG.RF20.unitSaved)).toBeTruthy();
    expect(app.getPathname()).toBe('/gestion-unidades');
    expect(screen.getByText('6 unidades')).toBeTruthy();
    expect(screen.getByText('0 personas')).toBeTruthy();

    await press(screen.getByRole('button', { name: 'Nueva unidad' }));
    await fireEvent.changeText(field('Nombre de la unidad'), 'portería');
    await press(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByText(MSG.RF20.unitDuplicate)).toBeTruthy();
  });

  it('edita el nombre y la dirección de una unidad', async () => {
    await openUnits();
    await press(screen.getByRole('button', { name: 'Editar unidad 78' }));
    expect(field('Nombre de la unidad').props.value).toBe('78');

    await fireEvent.changeText(field('Dirección (opcional)'), 'Casa # 78 Conjunto Convive');
    await press(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText(MSG.RF20.unitSaved)).toBeTruthy();
    expect(screen.getByText('Casa # 78 Conjunto Convive')).toBeTruthy();
  });
});

describe('RF20 · Permisos', () => {
  it.each([
    ['monica@gmail.com', 'Residente123'],
    ['junta@convive.com', 'Junta123'],
    ['vigilancia@convive.com', 'Vigilancia123'],
  ])('%s no puede abrir la administración de usuarios ni de unidades', async (email, password) => {
    const app = await renderSignedIn(email, password);

    for (const route of ['/gestion-usuarios', '/gestion-usuarios/nuevo', '/gestion-unidades', '/gestion-unidades/nueva'] as const) {
      await navigate(route);
      expect(app.getPathname()).not.toBe(route);
    }
  });
});
