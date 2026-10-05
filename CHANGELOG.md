# Changelog

Todos los cambios relevantes de Convive se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/). Mientras la app use datos simulados las
versiones serán `0.x.y`; la `1.0.0` corresponde a la primera publicación con backend real.

## [Sin publicar]

### Agregado

- **RF12 – Pago a través de la pasarela Wompi**:
  - «Aplicar» rediseñada: se quitan las opciones PSE / Tarjeta / Nequi y se agrega el botón «Pagar con Wompi» (teal #0F766E) con «Procesando…», chips con los medios habilitados del conjunto y texto de seguridad 🔒.
  - El servidor crea la transacción PENDIENTE con referencia única (CNV-{unidad}-{fecha}-{código}), valor en centavos COP y firma SHA-256 con el secreto de integridad guardado en el Vault de Supabase; la app solo recibe la llave pública.
  - Un solo pago PENDIENTE por unidad y concepto (MSG-RF12-03 con «Ver estado» y «Aceptar»), también garantizado por un índice único en la base de datos.
  - Mensajes MSG-RF12-01 (no se pudo iniciar), MSG-RF12-02 (cerró Wompi sin pagar: la transacción queda CANCELADA) y MSG-RF12-04 (Wompi no disponible).
  - Ventana de Wompi simulada mientras el conjunto no tenga llaves; «Volver» regresa a Selección y «Cancelar» a Pagos sin crear transacción.
  - Migración `20261005000000_pago_wompi.sql`: `wompi_conjuntos`, `transacciones_pago` con RLS y funciones `pasarela_pagos()`, `iniciar_pago()` y `cancelar_pago()`.
- **RF11 – Selección del concepto de pago**:
  - Saldo pendiente debajo de cada concepto y «Estado de la cuenta» calculado desde la cartera de la unidad (Supabase o datos simulados), también en Inicio y Pagos.
  - Campo «Valor a pagar» con el saldo del concepto por defecto, abono parcial y formato COP; «Otros conceptos» pide una descripción de 5 a 100 caracteres.
  - Validaciones MSG-RF11-01 a 03 y estado vacío MSG-RF11-05 («¡Estás al día!»). Los conceptos sin saldo se pueden pagar con cualquier valor mayor a $0 (reemplaza MSG-RF11-04).
  - «Aplicar» y la confirmación muestran el concepto y el valor elegidos; «Cancelar» en Selección vuelve a Inicio o Pagos, según desde dónde se abrió, y en Aplicar lleva a Pagos.
  - Migración `20261004000000_seleccion_concepto_pago.sql`: catálogo `conceptos_pago`, `cartera` con Row Level Security y función `mi_estado_cuenta()`.
- **RF04 – Reportes financieros filtrables**:
  - Pantalla Reportes para el administrador (desde el Panel) y la junta directiva en solo lectura (desde General).
  - Filtros de fecha inicial (primer día del mes), fecha final (hoy) y categoría con la opción «Todas».
  - Validaciones: fecha inicial ≤ final, rango máximo de 12 meses y fecha final no posterior a hoy.
  - Tabla de movimientos con totales de ingresos, egresos y saldo del periodo, y estado vacío sin datos.
  - Exportación a PDF (expo-print) y Excel (SheetJS), compartida con expo-sharing.
- Movimientos de ejemplo de julio a octubre de 2026 para probar los reportes.
- **RF16 – Perfil**: edición del teléfono (10 dígitos que empiezan por 3) con correo y unidad de solo lectura, confirmación al cerrar sesión y menú lateral ☰ (Perfil, Notificaciones, Ayuda, Cerrar sesión).
- **RF17 – Cambio de contraseña**: verificación de la contraseña actual, nueva contraseña distinta y segura, mensajes del documento (MSG-RF17-01 a 06), mostrar/ocultar contraseña y confirmación al salir con cambios.

- **Backend con Supabase – autenticación y perfiles**: esquema PostgreSQL con conjuntos, unidades y perfiles pre-registrados, Row Level Security, bloqueo por intentos y recuperación con código en el servidor; sesión guardada en el dispositivo y aviso «Tu sesión expiró». Sin configuración la app sigue usando los datos simulados.

### Corregido

- «Cambiar contraseña» aceptaba cualquier contraseña actual y usaba `Alert`, que no funciona en web.

## [0.1.0] - 2026-10-02

Primera versión de la app: todas las pantallas de los mockups, autenticación por rol (RF01) y
registro de ingresos y egresos (RF03). Los datos y la autenticación son simulados; aún no hay backend.

### Agregado

- Proyecto Expo SDK 57 con TypeScript y Expo Router, tema visual y componentes base de la interfaz (#1).
- Pantallas de Inicio, Pagos (selección de concepto, medio de pago y confirmación), Reservas,
  General, PQRS (listado y radicación) y Perfil con cambio de contraseña (#1).
- **RF01 – Autenticación por rol** (#2, #7):
  - Roles administrador, junta directiva, residente y vigilancia, con rutas protegidas por sesión y permisos.
  - Inicio de sesión en dos pasos (correo y contraseña) con bloqueo de 15 minutos tras 5 intentos fallidos.
  - Creación de contraseña para cuentas pre-registradas y recuperación con código de verificación.
  - Pantalla inicial según el rol: Panel, General, Inicio o Visitantes.
  - Perfil con los datos del usuario en sesión y cierre de sesión.
- **RF03 – Registro de ingresos y egresos** (#9):
  - Panel → Finanzas: listado de movimientos y formulario de registro, solo para el administrador.
  - Catálogo de categorías por tipo, monto en pesos con formato en vivo, fecha no futura y concepto de 5 a 250 caracteres.
  - Soporte adjunto PDF, JPG o PNG de máximo 5 MB desde la cámara, la galería o los archivos.
  - Auditoría de quién y cuándo registró cada movimiento.
- Sistema de mensajes (avisos y diálogos) que funciona en móvil y web (#7).
- Soporte web con react-native-web (#3).
- Pruebas automatizadas con Jest y React Native Testing Library: 205 pruebas de servicios,
  componentes, navegación y pantallas (#4, #7, #9).
- ESLint con `eslint-config-expo` (#8).

### Corregido

- El grupo `(auth)` no tenía layout y el inicio de sesión no quedaba protegido (#4).
- Etiquetas de accesibilidad en los campos de texto (#4).
- Error del gráfico de dona en web por `transform-origin` (#5).
- Proporciones de Reservas y General en pantallas anchas (#6).

### Limitaciones conocidas

- Autenticación y datos simulados: se reinician al recargar la app.
- Sin integración con Wompi ni notificaciones.
- RF02, RF04 a RF18 pendientes o parciales.

[Sin publicar]: https://github.com/Darksteven30/Convive_AppMobile/compare/v0.1.0...develop
[0.1.0]: https://github.com/Darksteven30/Convive_AppMobile/releases/tag/v0.1.0
