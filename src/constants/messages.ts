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
  RF03: {
    saved: 'Movimiento registrado correctamente.', // MSG-RF03-01
    amountInvalid: 'Ingresa un monto mayor a $ 0.', // MSG-RF03-02
    categoryRequired: 'Selecciona una categoría.', // MSG-RF03-03
    futureDate: 'La fecha no puede ser posterior a hoy.', // MSG-RF03-04
    descriptionShort: 'La descripción debe tener al menos 5 caracteres.', // MSG-RF03-05
    discardTitle: '¿Descartar el movimiento?', // MSG-RF03-06
    discardMessage: 'Los datos ingresados se perderán.', // MSG-RF03-06
    forbidden: 'No tienes permisos para realizar esta acción.', // MSG-RF03-07
    invalidFile: 'Solo se permiten archivos PDF, JPG o PNG de máximo 5 MB.', // MSG-RF03-08
    // Propuestos (no están en el documento):
    amountTooHigh: 'El monto máximo es $ 999.999.999,99.',
    mediaPermissionDenied:
      'Convive necesita acceso a la cámara o a tus fotos para adjuntar el soporte.',
  },
  RF04: {
    noData: 'No existe información para el rango seleccionado.', // MSG-RF04-01
    startAfterEnd: 'La fecha inicial no puede ser mayor que la fecha final.', // MSG-RF04-02
    rangeTooLong: 'El rango máximo de consulta es de 12 meses.', // MSG-RF04-03
    exported: 'Reporte exportado correctamente.', // MSG-RF04-04
    exportFailed: 'No pudimos exportar el reporte. Intenta de nuevo.', // MSG-RF04-05
    // Propuestos (no están en el documento):
    endAfterToday: 'La fecha final no puede ser posterior a hoy.',
    forbidden: 'No tienes permisos para consultar los reportes financieros.',
  },
  RF16: {
    phoneUpdated: 'Tus datos se actualizaron correctamente.', // MSG-RF16-01
    phoneInvalid: 'Ingresa un número de celular válido de 10 dígitos.', // MSG-RF16-02
    signOutTitle: '¿Quieres cerrar sesión?', // MSG-RF16-03
    // Propuesto (no está en el documento):
    readOnlyData: 'El correo y la unidad solo los puede cambiar la administración.',
  },
  RF17: {
    updated: 'Tu contraseña se actualizó correctamente.', // MSG-RF17-01
    wrongCurrent: 'La contraseña actual no es correcta.', // MSG-RF17-02
    mismatch: 'Las contraseñas no coinciden.', // MSG-RF17-03
    sameAsCurrent: 'La nueva contraseña debe ser diferente a la actual.', // MSG-RF17-04
    weak: 'La contraseña no cumple con los requisitos de seguridad.', // MSG-RF17-05
    leaveTitle: '¿Salir sin guardar?', // MSG-RF17-06
    leaveMessage: 'Los cambios se perderán.', // MSG-RF17-06
  },
  general: {
    unexpected: 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
    sessionExpired: 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.',
    // Propuesto (no está en el documento): opciones del menú que aún no existen.
    comingSoon: 'Esta sección estará disponible próximamente.',
  },
} as const;
