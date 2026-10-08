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
  RF02: {
    noPayments: 'Aún no tienes pagos registrados.', // MSG-RF02-01
    startAfterEnd: 'La fecha inicial no puede ser mayor que la fecha final.', // MSG-RF02-02
    receiptDownloaded: 'Comprobante descargado. Lo encuentras en tu carpeta de descargas.', // MSG-RF02-03
    receiptFailed: 'No pudimos generar el comprobante, intenta de nuevo.', // MSG-RF02-04
    loadFailed: 'No pudimos cargar tu estado de cuenta.', // MSG-RF02-05 (con «Reintentar»)
    upToDate: 'Estás al día', // Tarjeta «Estado de la cuenta» con saldo $ 0
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
  RF11: {
    conceptRequired: 'Selecciona un concepto de pago.', // MSG-RF11-01
    amountInvalid: 'El valor debe ser mayor a $ 0.', // MSG-RF11-02
    amountAboveBalance: (balance: string) =>
      `El valor no puede superar el saldo pendiente de este concepto (${balance}).`, // MSG-RF11-03
    upToDateTitle: '¡Estás al día!', // MSG-RF11-05
    upToDateMessage: 'No tienes pagos pendientes.', // MSG-RF11-05
    // Propuestos (no están en el documento). Los conceptos sin saldo se pueden pagar (p. ej. una
    // cuota extra), así que en lugar del toast MSG-RF11-04 se muestra esta indicación:
    noBalanceHint: 'Este concepto no tiene saldo pendiente. Ingresa el valor que deseas pagar.',
    partialHint: 'Puedes disminuir el valor para hacer un abono parcial.',
    descriptionLength: 'La descripción debe tener entre 5 y 100 caracteres.',
    amountBelowMinimum: (minimum: string) => `El valor mínimo para pagar en línea es ${minimum}.`,
  },
  RF12: {
    startFailed: 'No pudimos iniciar el pago. Intenta de nuevo en unos minutos.', // MSG-RF12-01
    cancelled: 'Cancelaste el pago. No se realizó ningún cobro.', // MSG-RF12-02
    pendingPayment:
      'Tienes un pago en proceso para este concepto. Espera su confirmación antes de intentar de nuevo.', // MSG-RF12-03
    unavailable: 'El servicio de pagos no está disponible en este momento. Intenta más tarde.', // MSG-RF12-04
    securityNote:
      'Al continuar se abrirá la ventana de pago de Wompi. Convive no almacena los datos de tu tarjeta ni de tu cuenta bancaria.',
  },
  RF13: {
    approvedTitle: 'Pago exitoso', // MSG-RF13-01
    approved: 'Tu pago fue aprobado y se aplicó a tu estado de cuenta.', // MSG-RF13-01
    declinedTitle: 'Pago rechazado', // MSG-RF13-02
    declined:
      'La entidad no aprobó tu pago. No se realizó ningún cobro. Puedes intentarlo de nuevo o usar otro medio de pago.', // MSG-RF13-02
    pendingTitle: 'Pago en proceso', // MSG-RF13-03
    pending:
      'Estamos esperando la confirmación de tu banco. Te avisaremos con una notificación cuando termine. No vuelvas a pagar este concepto.', // MSG-RF13-03
    errorTitle: 'No pudimos procesar tu pago', // MSG-RF13-04
    error: 'Ocurrió un problema con el medio de pago. Intenta de nuevo o usa otro medio.', // MSG-RF13-04
    voidedTitle: 'Pago anulado', // MSG-RF13-05
    voided: 'La transacción fue anulada y no se realizó ningún cobro.', // MSG-RF13-05
    receiptDownloaded: 'Comprobante descargado. Lo encuentras en tu carpeta de descargas.', // MSG-RF13-06
    stillPending: 'Tu pago sigue en proceso. Te avisaremos cuando cambie.', // MSG-RF13-07
    // Propuestos (no están en el documento):
    cancelledTitle: 'Pago cancelado',
    receiptFailed: 'No pudimos generar el comprobante. Intenta de nuevo.',
    notFound: 'No encontramos este pago.',
  },
  RF15: {
    // Propuestos (no están en el documento): el checkout real de Wompi se abre en otra pestaña (web).
    finishInWompi: 'Completa el pago en la pestaña de Wompi. Cuando termines, vuelve aquí y pulsa «Ya terminé».',
    popupBlocked: 'Tu navegador bloqueó la ventana de Wompi. Pulsa «Ir a Wompi» para abrirla.',
    statusUnknown:
      'No pudimos confirmar tu pago todavía. Lo revisaremos automáticamente en unos minutos; no vuelvas a pagar este concepto.',
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
