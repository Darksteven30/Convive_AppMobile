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
├── constants/theme.ts        # Colores, espaciados y tipografía
├── data/mock.ts              # Datos de ejemplo (reemplazar por el backend)
└── utils/format.ts           # Formato de moneda
```
