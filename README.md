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
| `__tests__/unit` | Servicios de autenticación, pagos, finanzas y exportación de reportes, permisos por rol, contexto de sesión, fechas y formato de moneda |
| `__tests__/components` | Calendario de reservas |
| `__tests__/navigation` | RF01: flujo de inicio/cierre de sesión y acceso de cada rol (incluido el bloqueo por ruta directa) |
| `__tests__/screens` | Pagos (RF11), PQRS, Reservas, General, Perfil y menú (RF16), cambio de contraseña (RF17), Finanzas (RF03) y Reportes (RF04) |

## Backend (Supabase)

La app funciona en dos modos:

- **Sin configurar** (por defecto y en las pruebas): usa servicios simulados en memoria; los datos se reinician al recargar.
- **Con Supabase**: la autenticación y los perfiles viven en el proyecto de Supabase y la sesión se guarda en el dispositivo. Por ahora usan Supabase la autenticación y el estado de la cuenta con el saldo por concepto (RF11); finanzas sigue simulada.

Para conectar un proyecto:

1. Crear una cuenta en [supabase.com](https://supabase.com) → **New project** (región *South America (São Paulo)*). Guardar la contraseña de la base de datos.
2. **SQL Editor** → pegar y ejecutar, en orden, `supabase/migrations/20261003000000_autenticacion.sql`, `supabase/migrations/20261004000000_seleccion_concepto_pago.sql` y después `supabase/seed.sql`. Si el proyecto ya tenía la autenticación, basta con ejecutar la migración del RF11 y el bloque «RF11 · Saldos pendientes» del final de `seed.sql`.
3. **Authentication → Sign In / Providers → Email**: desactivar **Confirm email** (las cuentas ya las registra la administración) y dejar el código (OTP) de 6 dígitos con vencimiento de **600** segundos.
4. **Authentication → Emails → Reset Password**: cambiar la plantilla para que envíe el código `{{ .Token }}` en lugar del enlace (la app pide el código de 6 dígitos).
5. **Project Settings → API Keys**: copiar la *Project URL* y la *publishable key* en un archivo `.env.local` (ver `.env.example`). Nunca usar la *secret key* en la app.
6. Reiniciar Expo limpiando la caché: `npx expo start --clear`.

Con Supabase, las cuentas de prueba empiezan **pre-registradas**: la primera vez, cada persona escribe su correo y la app le pide crear su contraseña (usen las de la tabla de abajo). `nuevo@convive.com` se deja sin crear para probar ese flujo.

> En el plan gratuito, Supabase pausa el proyecto tras una semana sin uso (se reactiva desde el panel) y el servidor de correo incluido envía pocos correos por hora.

## Usuarios de prueba

En modo simulado, las cuentas ya tienen estas contraseñas (`src/services/auth.mock.ts`). Los permisos por rol están en `src/constants/permissions.ts`:

| Rol | Correo | Contraseña | Pantalla inicial | Acceso |
|---|---|---|---|---|
| Administrador | admin@convive.com | Admin123 | Panel | Todas las secciones |
| Junta directiva | junta@convive.com | Junta123 | General | Todas las secciones excepto Panel |
| Residente | monica@gmail.com | Residente123 | Inicio | Inicio, Pagos, Reservas, PQRS y Perfil |
| Vigilancia | vigilancia@convive.com | Vigilancia123 | Visitantes | Visitantes, Inicio (sin estado de cuenta), Reservas, PQRS y Perfil |

Otros casos del inicio de sesión (RF01):

- **Cuenta pre-registrada sin contraseña:** `nuevo@convive.com` → pantalla «Crea tu contraseña».
- **Correo no registrado:** cualquier otro correo → diálogo «Este correo no está registrado…».
- **Bloqueo:** 5 contraseñas incorrectas bloquean la cuenta 15 minutos.
- **Recuperar contraseña:** en modo simulado el código es siempre `123456` (vence a los 10 minutos); con Supabase llega por correo.

**Finanzas (RF03):** con el administrador, Panel → «Registrar movimiento» o «Ver movimientos». El soporte adjunto acepta PDF, JPG o PNG de máximo 5 MB (en Expo Go se usa la cámara, la galería o los archivos del celular).

**Reportes (RF04):** con el administrador, Panel → «Reportes»; con la junta directiva, General → «Ver reportes financieros». Filtra por fecha inicial, fecha final (máximo 12 meses) y categoría, muestra los totales del periodo y exporta a PDF o Excel. Los datos de ejemplo tienen movimientos de julio a octubre de 2026. En el celular el archivo se abre en la hoja de compartir; en web el PDF abre el diálogo de impresión («Guardar como PDF») y el Excel se descarga.

**Pagos (RF11):** con la residente, Inicio o Pagos → «Abonar». Cada concepto muestra su saldo pendiente (casa 56: administración $35.000, extraordinaria sin saldo, otros $10.678,90). Al elegir uno aparece «Valor a pagar» con el saldo por defecto; se puede bajar para un abono parcial, pero no superar el saldo. Los conceptos sin saldo también se pueden pagar con cualquier valor mayor a $0, y «Otros conceptos» pide una descripción de 5 a 100 caracteres. El administrador (unidad sin saldo) ve «¡Estás al día!».

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
