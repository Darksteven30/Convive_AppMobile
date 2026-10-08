# Changelog

Todos los cambios relevantes de Convive se registran en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[Versionado Semántico](https://semver.org/lang/es/). Mientras la app use datos simulados las
versiones serán `0.x.y`; la `1.0.0` corresponde a la primera publicación con backend real.

## [Sin publicar]

## [0.2.0] - 2026-10-08

Primera versión con backend: autenticación y perfiles en Supabase, pagos en línea con Wompi Sandbox
(RF11, RF12, RF13 y RF15), estado de cuenta con comprobantes (RF02), reportes financieros (RF04) y
perfil con cambio de contraseña (RF16 y RF17). Sin configurar Supabase, la app sigue funcionando con
datos simulados. 461 pruebas automatizadas.

### Agregado

- **Backend con Supabase – autenticación y perfiles** (#14): esquema PostgreSQL con conjuntos, unidades y perfiles pre-registrados, Row Level Security y bloqueo por intentos en el servidor; sesión guardada en el dispositivo y aviso «Tu sesión expiró». Sin configuración la app sigue usando los datos simulados. La recuperación de contraseña por correo con Supabase aún no funciona: requiere configurar un SMTP propio para enviar el código.
- **RF02 – Estado de cuenta y descarga de comprobantes** (#21):
  - Tarjeta «Estado de la cuenta» en Inicio y Pagos: con saldo $ 0 muestra «Estás al día» en verde y oculta «Abonar»; si no se puede consultar, MSG-RF02-05 con «Reintentar».
  - «Historial de pagos» con los pagos APROBADOS de la unidad, del más reciente al más antiguo, 12 por página con «Ver más» («Ago 2026 — Cuota administración»); reemplaza la lista fija de ejemplo.
  - Filtro de periodo con fecha inicial y final (por defecto, los últimos 12 meses) y MSG-RF02-02 si la inicial es mayor que la final; estado vacío MSG-RF02-01.
  - Cada pago se marca con un check; «Descargar comprobante» se habilita al elegir uno y genera el PDF con logo, conjunto, unidad, propietario, concepto, valor, fecha, medio de pago, referencia e ID de Wompi (MSG-RF02-03 y MSG-RF02-04).
  - Deslizar hacia abajo vuelve a consultar el saldo y el historial.
  - Migración `20261009000000_estado_cuenta.sql`: función `mi_historial_pagos()`, que filtra por la unidad de la sesión (también para el administrador, que por RLS ve los pagos de todo el conjunto). `seed.sql` agrega pagos de ejemplo de la casa 56.
- **RF04 – Reportes financieros filtrables** (#12):
  - Pantalla Reportes para el administrador (desde el Panel) y la junta directiva en solo lectura (desde General).
  - Filtros de fecha inicial (primer día del mes), fecha final (hoy) y categoría con la opción «Todas».
  - Validaciones: fecha inicial ≤ final, rango máximo de 12 meses y fecha final no posterior a hoy.
  - Tabla de movimientos con totales de ingresos, egresos y saldo del periodo, y estado vacío sin datos.
  - Exportación a PDF (expo-print) y Excel (SheetJS), compartida con expo-sharing.
- Movimientos de ejemplo de julio a octubre de 2026 para probar los reportes (#12).
- **RF11 – Selección del concepto de pago** (#15):
  - Saldo pendiente debajo de cada concepto y «Estado de la cuenta» calculado desde la cartera de la unidad (Supabase o datos simulados), también en Inicio y Pagos.
  - Campo «Valor a pagar» con el saldo del concepto por defecto, abono parcial y formato COP; «Otros conceptos» pide una descripción de 5 a 100 caracteres.
  - Validaciones MSG-RF11-01 a 03 y estado vacío MSG-RF11-05 («¡Estás al día!»). Los conceptos sin saldo se pueden pagar desde $ 1.500, el mínimo de Wompi (reemplaza MSG-RF11-04).
  - «Aplicar» y la confirmación muestran el concepto y el valor elegidos; «Cancelar» en Selección vuelve a Inicio o Pagos, según desde dónde se abrió, y en Aplicar lleva a Pagos.
  - Migración `20261004000000_seleccion_concepto_pago.sql`: catálogo `conceptos_pago`, `cartera` con Row Level Security y función `mi_estado_cuenta()`.
- **RF12 – Pago a través de la pasarela Wompi** (#16):
  - «Aplicar» rediseñada: se quitan las opciones PSE / Tarjeta / Nequi y se agrega el botón «Pagar con Wompi» (teal #0F766E) con «Procesando…», chips con los medios habilitados del conjunto y texto de seguridad 🔒.
  - El servidor crea la transacción PENDIENTE con referencia única (CNV-{unidad}-{fecha}-{código}), valor en centavos COP y firma SHA-256 con el secreto de integridad guardado en el Vault de Supabase; la app solo recibe la llave pública.
  - Un solo pago PENDIENTE por unidad y concepto (MSG-RF12-03 con «Ver estado» y «Aceptar»), también garantizado por un índice único en la base de datos.
  - Mensajes MSG-RF12-01 (no se pudo iniciar), MSG-RF12-02 (cerró Wompi sin pagar: la transacción queda CANCELADA) y MSG-RF12-04 (Wompi no disponible).
  - Ventana de Wompi simulada mientras el conjunto no tenga llaves; «Volver» regresa a Selección y «Cancelar» a Pagos sin crear transacción.
  - Migración `20261005000000_pago_wompi.sql`: `wompi_conjuntos`, `transacciones_pago` con RLS y funciones `pasarela_pagos()`, `iniciar_pago()` y `cancelar_pago()`.
- **RF13 – Confirmación del resultado del pago y comprobante** (#18):
  - Una pantalla por estado con su ícono, color y mensaje: Pago exitoso, Pago rechazado, Pago en proceso (reloj naranja), No pudimos procesar tu pago y Pago anulado (MSG-RF13-01 a 05).
  - El estado se lee del servidor después de consultarlo en Wompi; nunca se toma de la ventana de pago. Con el ID de Wompi conocido, el servidor consulta `GET /transactions/{id}`.
  - Tabla de detalle con datos reales: concepto, valor, fecha («09 sep 2026 - 06:19 p. m.»), medio informado por Wompi, referencia Convive e ID Wompi.
  - «Descargar comprobante» en PDF solo para pagos aprobados (MSG-RF13-06); «Intentar de nuevo» en rechazado o error vuelve a Aplicar con el mismo concepto y valor y una referencia nueva; «Actualizar estado» en proceso vuelve a consultar (MSG-RF13-07).
  - El saldo solo se descuenta si el pago es APROBADO y «Volver al inicio» lo muestra actualizado.
  - En modo simulado, la ventana de Wompi permite elegir el resultado (aprobado, rechazado, en proceso o error) para probar cada pantalla.
- **RF15 – Integración y conciliación con Wompi** (#17):
  - Llaves de Wompi por conjunto: la pública en `wompi_conjuntos` y la privada, el secreto de eventos y el de integridad cifrados en el Vault de Supabase. `configurar_wompi()` exige que las cuatro sean del mismo ambiente (Sandbox o Producción), así que pasar a producción no requiere cambiar código.
  - Edge Function `wompi-webhook`: recibe `transaction.updated`, valida el checksum con el secreto de eventos y descarta los eventos que no coinciden; es idempotente (cada evento se procesa una sola vez).
  - El saldo se descuenta una sola vez cuando el pago queda APROBADO y se devuelve si Wompi lo anula (VOIDED); un pago terminado no vuelve a PENDIENTE.
  - Edge Function `wompi-estado`: consulta el estado en el API de Wompi (`GET /transactions?reference=`) para pagos de la propia unidad.
  - Edge Function `wompi-conciliar` y tarea pg_cron cada 15 minutos: revisa los pagos PENDIENTES de más de 30 minutos y cancela los abandonados para que no bloqueen nuevos pagos.
  - Con Supabase, «Pagar con Wompi» abre el checkout real de Wompi (expo-web-browser) y al volver consulta el estado en el servidor; sin Supabase sigue la ventana simulada.
  - La notificación push del resultado queda pendiente para el RF09.
  - Pruebas: lógica del webhook, la conciliación, la consulta de estado y la firma (Jest, con el ejemplo oficial de Wompi) y pruebas de base de datos en `supabase/tests/rf15_wompi_test.sql`.
- **RF16 – Perfil** (#13): edición del teléfono (10 dígitos que empiezan por 3) con correo y unidad de solo lectura, confirmación al cerrar sesión y menú lateral ☰ (Perfil, Notificaciones, Ayuda, Cerrar sesión).
- **RF17 – Cambio de contraseña** (#13): verificación de la contraseña actual, nueva contraseña distinta y segura, mensajes del documento (MSG-RF17-01 a 06), mostrar/ocultar contraseña y confirmación al salir con cambios.

### Cambiado

- **RF14** (#19): el residente puede consultar General (resumen financiero) en solo lectura, como indica el documento; los reportes siguen siendo solo para el administrador y la junta directiva.
- El botón de Inicio «Realizar PQR» ahora dice «Radicar PQRS», como en el documento (RF18, #19).
- Todos los valores en pesos usan el formato del documento con espacio tras el signo («$ 45.678,90»); antes Inicio, Pagos, Panel, General y el pago mostraban «$45.678,90» (#19, #20).

### Corregido

- «Cambiar contraseña» aceptaba cualquier contraseña actual y usaba `Alert`, que no funciona en web (#13).
- **Pagos** (#19): Wompi no acepta transacciones de menos de $ 1.500 y la app dejaba continuar desde $ 1, así que el residente quedaba atascado en la ventana de pago y al volver veía «Cancelaste el pago». Ahora Selección muestra «El valor mínimo para pagar en línea es $ 1.500,00.» y `iniciar_pago()` aplica la misma regla en el servidor (migración `20261008000000_monto_minimo_wompi.sql`).
- **Pagos** (#19): la pantalla de un pago rechazado, en proceso, con error o anulado decía «Valor pagado» aunque no se hubiera cobrado nada; ahora dice «Valor».
- Los avisos de Reservas, PQRS y «Descargar comprobante» en Pagos usaban `Alert`, que no se ve en web; ahora son mensajes tipo toast que funcionan en el celular y en web (#19).

### Limitaciones conocidas

- Finanzas (RF03, RF04) y el resumen General (RF14) siguen con datos simulados; aún no están en Supabase.
- Wompi está en modo Sandbox (pagos de prueba, sin dinero real).
- La recuperación de contraseña por correo requiere configurar un SMTP propio en Supabase.
- Inicio de sesión con Google y Apple pendiente (requiere credenciales y un development build).
- Pendientes: reservas (RF05, RF06), PQRS (RF07, RF08), notificaciones push (RF09) y visitantes (RF10).
- El plan gratuito de Supabase pausa el proyecto tras 7 días sin uso; hay que reactivarlo antes de cada demo.

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

[Sin publicar]: https://github.com/Darksteven30/Convive_AppMobile/compare/v0.2.0...develop
[0.2.0]: https://github.com/Darksteven30/Convive_AppMobile/releases/tag/v0.2.0
[0.1.0]: https://github.com/Darksteven30/Convive_AppMobile/releases/tag/v0.1.0
