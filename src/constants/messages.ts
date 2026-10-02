// Textos al usuario definidos en el documento de requisitos (sección 7.2).
// Los códigos sin número MSG en el documento se marcan como "propuesto".

export const MSG = {
  RF01: {
    emailRequired: 'Ingresa tu correo electrónico.', // MSG-RF01-01
    emailInvalid: 'Ingresa un correo válido, por ejemplo nombre@dominio.com.', // MSG-RF01-02
    emailNotRegistered:
      'Este correo no está registrado en ningún conjunto. Comunícate con la administración para que te habiliten el acceso.', // MSG-RF01-03
    wrongPassword: (remaining: number) =>
      `El correo o la contraseña no son correctos. Te quedan ${remaining} ${remaining === 1 ? 'intento' : 'intentos'}.`, // MSG-RF01-04
    accountLocked:
      'Por seguridad bloqueamos tu cuenta durante 15 minutos. Puedes esperar o recuperar tu contraseña.', // MSG-RF01-05
    socialCancelled: 'Se canceló el inicio de sesión.', // MSG-RF01-06
    resetCodeSent: (email: string) =>
      `Te enviamos un código a ${email}. Revisa también la carpeta de spam.`, // MSG-RF01-07
    // Propuestos (no están en el documento):
    resetCodeInvalid: 'El código no es válido o ya venció. Solicita uno nuevo.',
    passwordUpdated: 'Tu contraseña se actualizó. Inicia sesión con tu nueva contraseña.',
    passwordsDontMatch: 'Las contraseñas no coinciden.',
    socialUnavailable: 'El inicio de sesión con Google y Apple estará disponible próximamente.',
  },
  general: {
    unexpected: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
  },
} as const;
