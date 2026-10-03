# Convive_AppMobile
Aplicacion movil para la gestion y administracion de propiedad horizontal. Creada por David Steven Muñoz y Monica Galvis, estudiantes de Ing. de sistemas de la universidad Santiago de Cali.

## Tecnologías

- [Expo](https://expo.dev) SDK 57 + React Native
- [Expo Router](https://docs.expo.dev/router/introduction/) (navegación basada en archivos)
- TypeScript

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
| `__tests__/unit` | Servicios de autenticación, finanzas y exportación de reportes, permisos por rol, contexto de sesión, fechas y formato de moneda |
| `__tests__/components` | Calendario de reservas |
| `__tests__/navigation` | RF01: flujo de inicio/cierre de sesión y acceso de cada rol (incluido el bloqueo por ruta directa) |
| `__tests__/screens` | Pagos, PQRS, Reservas, General, Perfil y menú (RF16), cambio de contraseña (RF17), Finanzas (RF03) y Reportes (RF04) |

## Usuarios de prueba

La autenticación usa un servicio simulado (`src/services/auth.service.ts`) y los permisos por rol están en `src/constants/permissions.ts`:

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
- **Recuperar contraseña:** el código de verificación del servicio simulado es siempre `123456` (vence a los 10 minutos).

**Finanzas (RF03):** con el administrador, Panel → «Registrar movimiento» o «Ver movimientos». El soporte adjunto acepta PDF, JPG o PNG de máximo 5 MB (en Expo Go se usa la cámara, la galería o los archivos del celular).

**Reportes (RF04):** con el administrador, Panel → «Reportes»; con la junta directiva, General → «Ver reportes financieros». Filtra por fecha inicial, fecha final (máximo 12 meses) y categoría, muestra los totales del periodo y exporta a PDF o Excel. Los datos de ejemplo tienen movimientos de julio a octubre de 2026. En el celular el archivo se abre en la hoja de compartir; en web el PDF abre el diálogo de impresión («Guardar como PDF») y el Excel se descarga.

**Perfil y contraseña (RF16 y RF17):** el avatar o el menú ☰ → «Perfil». Solo el teléfono se puede editar (10 dígitos que empiecen por 3); correo y unidad son de solo lectura. «Cambiar contraseña» verifica la contraseña actual y exige una nueva distinta que cumpla las reglas. Cerrar sesión (desde el Perfil o el menú) pide confirmación.

Los datos simulados se reinician al recargar la app.

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
├── context/                  # Sesión del usuario (SessionContext)
├── services/                 # Servicios (auth simulado)
├── constants/theme.ts        # Colores, espaciados y tipografía
├── data/mock.ts              # Datos de ejemplo (reemplazar por el backend)
└── utils/format.ts           # Formato de moneda
```
