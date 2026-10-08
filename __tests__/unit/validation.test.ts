import {
  formatPhone,
  isValidEmail,
  isValidPhone,
  meetsPasswordRules,
  normalizeEmail,
  normalizePhone,
  passwordRules,
} from '@/utils/validation';

describe('normalizeEmail', () => {
  it('quita espacios y pasa a minúsculas', () => {
    expect(normalizeEmail('  Monica@Gmail.COM ')).toBe('monica@gmail.com');
  });
});

describe('isValidEmail', () => {
  it.each(['monica@gmail.com', 'nombre.apellido@dominio.co', 'ADMIN@convive.com'])('acepta %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'monica', 'monica@', 'monica@gmail', '@gmail.com', 'monica@@gmail.com'])(
    'rechaza "%s"',
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );

  it('rechaza correos de más de 100 caracteres', () => {
    const local = 'a'.repeat(95);
    expect(isValidEmail(`${local}@b.co`)).toBe(true); // 100 caracteres
    expect(isValidEmail(`${local}a@b.co`)).toBe(false); // 101 caracteres
  });
});

describe('meetsPasswordRules', () => {
  it.each([
    ['Corta1', false],
    ['sinmayuscula1', false],
    ['SinNumeroNiSimbolo', false],
    ['Valida123', true],
    ['Valida!!', true],
  ])('%s → %s', (password, expected) => {
    expect(meetsPasswordRules(password)).toBe(expected);
  });

  it('rechaza contraseñas de más de 50 caracteres', () => {
    expect(meetsPasswordRules(`A1${'a'.repeat(48)}`)).toBe(true);
    expect(meetsPasswordRules(`A1${'a'.repeat(49)}`)).toBe(false);
  });

  it('expone las tres reglas que muestra la interfaz', () => {
    expect(passwordRules.map((rule) => rule.label)).toEqual([
      'Mínimo 8 caracteres',
      'Una mayúscula',
      'Un número o símbolo',
    ]);
  });
});

describe('teléfono (RF16)', () => {
  it.each(['3111234567', '311 123 4567', '300-111-2233'])('acepta %s', (phone) => {
    expect(isValidPhone(phone)).toBe(true);
  });

  it.each([
    ['no empieza por 3', '2111234567'],
    ['tiene menos de 10 dígitos', '311123456'],
    ['tiene más de 10 dígitos', '31112345678'],
    ['está vacío', ''],
  ])('rechaza un teléfono que %s', (_case, phone) => {
    expect(isValidPhone(phone)).toBe(false);
  });

  it('normaliza a dígitos y formatea para mostrar', () => {
    expect(normalizePhone('311 123-4567')).toBe('3111234567');
    expect(formatPhone('3111234567')).toBe('311 123 4567');
  });
});
