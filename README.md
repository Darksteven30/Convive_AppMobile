# Convive_AppMobile
Aplicacion movil para la gestion y administracion de propiedad horizontal. Creada por David Steven Muñoz y Monica Galvis, estudiantes de Ing. de sistemas de la universidad Santiago de Cali.

## Tecnologías

- [Expo](https://expo.dev) SDK 57 + React Native
- [Expo Router](https://docs.expo.dev/router/introduction/) (navegación basada en archivos)
- TypeScript
- [Supabase](https://supabase.com) (autenticación y base de datos PostgreSQL)

## Ejecutar el proyecto

```bash
npm install
npm start          # abre Expo; escanea el QR con Expo Go
npm run typecheck  # verificación de tipos
npm run lint       # revisión de estilo y errores comunes (ESLint)
```

## Pruebas

Pruebas automatizadas con Jest, React Native Testing Library y `expo-router/testing-library`:

```bash
npm test               # ejecuta todas las pruebas
npm run test:watch     # vuelve a ejecutarlas al guardar cambios
npm run test:coverage  # genera el reporte de cobertura
```

| Carpeta | Qué prueba |
|---|---|
| `__tests__/unit` | Servicios de autenticación, pagos, funciones de Wompi (checksum y API), finanzas y exportación de reportes, permisos por rol, contexto de sesión, fechas y formato de moneda |
| `__tests__/components` | Calendario de reservas |
| `__tests__/navigation` | RF01: flujo de inicio/cierre de sesión y acceso de cada rol (incluido el bloqueo por ruta directa) |
| `__tests__/screens` | Pagos (RF11, RF12, RF13 y RF15), PQRS, Reservas, General, Perfil y menú (RF16), cambio de contraseña (RF17), Finanzas (RF03) y Reportes (RF04) |

## Backend (Supabase)

La app funciona en dos modos:

- **Sin configurar** (por defecto y en las pruebas): usa servicios simulados en memoria; los datos se reinician al recargar.
- **Con Supabase**: la autenticación y los perfiles viven en el proyecto de Supabase y la sesión se guarda en el dispositivo. Por ahora usan Supabase la autenticación, el estado de la cuenta con el saldo por concepto (RF11) la creación del pago (RF12) y la integración con Wompi: checkout, webhook, consulta de estado y conciliación (RF15); finanzas sigue simulada.

Para conectar un proyecto:

1. Crear una cuenta en [supabase.com](https://supabase.com) → **New project** (región *South America (São Paulo)*). Guardar la contraseña de la base de datos.
2. **SQL Editor** → pegar y ejecutar, en orden, `supabase/migrations/20261003000000_autenticacion.sql`, `supabase/migrations/20261004000000_seleccion_concepto_pago.sql`, `supabase/migrations/20261005000000_pago_wompi.sql`, `supabase/migrations/20261006000000_integracion_wompi.sql` y después `supabase/seed.sql`. Si el proyecto ya tenía las anteriores, basta con ejecutar la migración nueva y su bloque del final de `seed.sql` («RF11 · Saldos pendientes», «RF12 · Cuenta Wompi del conjunto»).
3. **Authentication → Sign In / Providers → Email**: desactivar **Confirm email** (las cuentas ya las registra la administración) y dejar el código (OTP) de 6 dígitos con vencimiento de **600** segundos.
4. **Authentication → Emails → Reset Password**: cambiar la plantilla para que envíe el código `{{ .Token }}` en lugar del enlace (la app pide el código de 6 dígitos).
5. **Project Settings → API Keys**: copiar la *Project URL* y la *publishable key* en un archivo `.env.local` (ver `.env.example`). Nunca usar la *secret key* en la app.
6. Reiniciar Expo limpiando la caché: `npx expo start --clear`.

Con Supabase, las cuentas de prueba empiezan **pre-registradas**: la primera vez, cada persona escribe su correo y la app le pide crear su contraseña (usen las de la tabla de abajo). `nuevo@convive.com` se deja sin crear para probar ese flujo.

### Wompi (RF15)

El pago se hace en el **checkout real de Wompi**. Las llaves son **por conjunto**: la pública vive en `wompi_conjuntos` y la privada, el secreto de eventos y el de integridad se guardan **cifrados en el Vault** de Supabase. Nunca van en la app, en el código, en `.env.local` ni en GitHub.

1. **SQL Editor** → ejecutar `supabase/migrations/20261006000000_integracion_wompi.sql`. Si responde que no puede crear `pg_cron` o `pg_net`, actívalas en **Database → Extensions** y vuelve a ejecutarla.
2. **SQL Editor** → cargar las llaves del conjunto (panel de Wompi → *Desarrolladores*). La función exige que las cuatro sean del mismo ambiente, así que no se pueden mezclar llaves de Sandbox y de Producción:
   ```sql
   select public.configurar_wompi(
     (select id from public.conjuntos where nombre = 'Conjunto Residencial Convive'),
     'sandbox',            -- o 'produccion'
     'pub_test_…', 'prv_test_…', 'test_events_…', 'test_integrity_…'
   );
   ```
   Para **pasar a producción** se ejecuta lo mismo con `'produccion'` y las llaves `pub_prod_…`, `prv_prod_…`, `prod_events_…` y `prod_integrity_…`. No hay que cambiar código.
3. **SQL Editor** → datos para la conciliación automática cada 15 minutos (el token es cualquier texto largo y aleatorio):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
   select vault.create_secret('<texto-aleatorio-largo>', 'conciliacion_token');
   ```
4. **Publicar las Edge Functions** (`supabase/functions`) desde la terminal:
   ```powershell
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase functions deploy --use-api
   ```
   - `wompi-webhook` recibe los eventos de Wompi.
   - `wompi-estado` consulta el estado de un pago.
   - `wompi-conciliar` revisa los pagos pendientes de más de 30 minutos.
5. **Panel de Wompi → Desarrolladores → URL de eventos** (en Sandbox y luego en Producción): `https://<project-ref>.supabase.co/functions/v1/wompi-webhook`.

**Pruebas de base de datos del RF15:** en el SQL Editor, ejecutar `supabase/tests/rf15_wompi_test.sql`. Prueba las llaves por ambiente, el saldo aplicado una sola vez, la devolución si se anula, los eventos repetidos y la conciliación, y deshace sus datos al final. Si todo pasa, responde con el mensaje «RF15 OK: 16 pruebas pasaron».

Pruebas en Sandbox: Wompi tiene datos de prueba para cada medio (p. ej. la tarjeta `4242 4242 4242 4242` es aprobada y la `4111 1111 1111 1111` es rechazada). El saldo baja solo cuando Wompi confirma el pago como **APROBADO**.

> En el plan gratuito, Supabase pausa el proyecto tras una semana sin uso (se reactiva desde el panel) y el servidor de correo incluido envía pocos correos por hora.

## Usuarios de prueba

En modo simulado, las cuentas ya tienen estas contraseñas (`src/services/auth.mock.ts`). Los permisos por rol están en `src/constants/permissions.ts`:

| Rol | Correo | Contraseña | Pantalla inicial | Acceso |
|---|---|---|---|---|
| Administrador | admin@convive.com | Admin123 | Panel | Todas las secciones |
| Junta directiva | junta@convive.com | Junta123 | General | Todas las secciones excepto Panel |
| Residente | monica@gmail.com | Residente123 | Inicio | Inicio, Pagos, Reservas, General (solo lectura, sin reportes), PQRS y Perfil |
| Vigilancia | vigilancia@convive.com | Vigilancia123 | Visitantes | Visitantes, Inicio (sin estado de cuenta), Reservas, PQRS y Perfil |

Otros casos del inicio de sesión (RF01):

- **Cuenta pre-registrada sin contraseña:** `nuevo@convive.com` → pantalla «Crea tu contraseña».
- **Correo no registrado:** cualquier otro correo → diálogo «Este correo no está registrado…».
- **Bloqueo:** 5 contraseñas incorrectas bloquean la cuenta 15 minutos.
- **Recuperar contraseña:** en modo simulado el código es siempre `123456` (vence a los 10 minutos); con Supabase llega por correo.

**Finanzas (RF03):** con el administrador, Panel → «Registrar movimiento» o «Ver movimientos». El soporte adjunto acepta PDF, JPG o PNG de máximo 5 MB (en Expo Go se usa la cámara, la galería o los archivos del celular).

**Reportes (RF04):** con el administrador, Panel → «Reportes»; con la junta directiva, General → «Ver reportes financieros». Filtra por fecha inicial, fecha final (máximo 12 meses) y categoría, muestra los totales del periodo y exporta a PDF o Excel. Los datos de ejemplo tienen movimientos de julio a octubre de 2026. En el celular el archivo se abre en la hoja de compartir; en web el PDF abre el diálogo de impresión («Guardar como PDF») y el Excel se descarga.

**Pagos (RF11):** con la residente, Inicio o Pagos → «Abonar». Cada concepto muestra su saldo pendiente (casa 56: administración $35.000, extraordinaria sin saldo, otros $10.678,90). Al elegir uno aparece «Valor a pagar» con el saldo por defecto; se puede bajar para un abono parcial, pero no superar el saldo. Los conceptos sin saldo también se pueden pagar con cualquier valor mayor a $0, y «Otros conceptos» pide una descripción de 5 a 100 caracteres. El administrador (unidad sin saldo) ve «¡Estás al día!».

**Pago con Wompi (RF12):** después de elegir el concepto, «Aplicar» muestra el botón «Pagar con Wompi», los medios habilitados del conjunto y el texto de seguridad. Al pulsarlo se crea la transacción PENDIENTE con referencia única y firma, y se abre la ventana de Wompi con el valor en centavos (no editable). Con Supabase y las llaves configuradas (ver «Wompi (RF15)») se abre el checkout real de Wompi Sandbox; sin Supabase, la ventana es **simulada**: se elige el medio y «Pagar» lleva a la confirmación; cerrarla con ✕ cancela el pago. Un segundo pago del mismo concepto mientras el primero sigue PENDIENTE muestra «Tienes un pago en proceso…».

**Resultado del pago (RF13):** al terminar en Wompi, la Confirmación muestra el estado que el servidor consultó en Wompi: exitoso (con «Descargar comprobante» en PDF), rechazado o error (con «Intentar de nuevo»), en proceso (con «Actualizar estado») o anulado. En modo simulado, la ventana de Wompi tiene «Resultado de la prueba» para elegir cada caso; con Wompi Sandbox, la tarjeta 4242 4242 4242 4242 se aprueba y la 4111 1111 1111 1111 se rechaza. El saldo solo baja cuando el pago se aprueba.

**Perfil y contraseña (RF16 y RF17):** el avatar o el menú ☰ → «Perfil». Solo el teléfono se puede editar (10 dígitos que empiecen por 3); correo y unidad son de solo lectura. «Cambiar contraseña» verifica la contraseña actual y exige una nueva distinta que cumpla las reglas. Cerrar sesión (desde el Perfil o el menú) pide confirmación.

En modo simulado los datos se reinician al recargar la app.

## Versiones

El historial de cambios está en [CHANGELOG.md](CHANGELOG.md). Se trabaja con gitflow: `develop` integra las ramas `feature/` y `bugfix/`; cada versión sale de una rama `release/x.y.z` que se fusiona en `main` y se etiqueta `vx.y.z`. Las correcciones urgentes sobre una versión publicada van en ramas `hotfix/` desde `main`.

La versión se actualiza en `package.json` (`npm version x.y.z --no-git-tag-version`) y en `expo.version` de `app.json`.

## Estructura

```
src/
├── app/                      # Rutas (cada archivo es una pantalla)
│   ├── (auth)/sign-in.tsx    # Registro / inicio de sesión
│   └── (app)/                # App autenticada con barra inferior
│       ├── (home)/           # Inicio, Pagos, Reservas, General, PQRS, Perfil
│       │   └── pago/         # Flujo de pago: selección → aplicar → confirmación
│       └── buscar | movimientos | billetera
├── components/
│   ├── charts/               # Gráficos de barras y dona
│   ├── layout/               # Encabezado, pestañas superiores, contenedor de pantalla
│   └── ui/                   # Botones, tarjetas, chips, campos, calendario
├── context/                  # Sesión del usuario (SessionContext) y mensajes (FeedbackContext)
├── lib/supabase.ts           # Cliente de Supabase (si hay .env.local)
├── services/                 # auth y payments eligen entre su versión supabase y mock; finanzas simulada
├── constants/theme.ts        # Colores, espaciados y tipografía
├── data/mock.ts              # Datos de ejemplo (reemplazar por el backend)
└── utils/                    # Fechas, moneda y validaciones
supabase/
├── migrations/               # Esquema SQL: tablas, Row Level Security y funciones
└── seed.sql                  # Conjunto y cuentas de prueba
```
