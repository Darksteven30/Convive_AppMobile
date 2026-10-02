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
| `__tests__/unit` | Servicio de autenticación, permisos por rol, contexto de sesión y formato de moneda |
| `__tests__/components` | Calendario de reservas |
| `__tests__/navigation` | RF01: flujo de inicio/cierre de sesión y acceso de cada rol (incluido el bloqueo por ruta directa) |
| `__tests__/screens` | Pagos, PQRS, Reservas, General, Perfil y cambio de contraseña |

## Usuarios de prueba

La autenticación usa un servicio simulado (`src/services/auth.service.ts`) y los permisos por rol están en `src/constants/permissions.ts`:

| Rol | Correo | Contraseña | Acceso |
|---|---|---|---|
| Administrador | admin@convive.com | Admin123 | Todas las secciones |
| Junta directiva | junta@convive.com | Junta123 | Todas las secciones |
| Residente | monica@gmail.com | Residente123 | Inicio, Pagos, Reservas, PQRS y Perfil |
| Vigilancia | vigilancia@convive.com | Vigilancia123 | Inicio (sin estado de cuenta), Reservas, PQRS y Perfil |

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
