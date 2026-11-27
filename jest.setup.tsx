// Los íconos son decorativos: se reemplazan por una vista con testID para no cargar fuentes en Jest.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  const Ionicons = ({ name }: { name: string }) => <View testID={`icon-${name}`} />;
  return { __esModule: true, default: Ionicons };
});

// expo-sqlite (almacenamiento de la sesión de Supabase) es un módulo nativo que no existe en Jest.
// Las pruebas usan el servicio simulado, así que basta con ignorar su instalación.
jest.mock('expo-sqlite/localStorage/install', () => ({}));

// En Jest, expo-constants no carga el «extra» de app.json: se da un projectId de EAS de prueba para
// que la app pueda pedir el Expo push token (RF09), como en un build real.
jest.mock('expo-constants', () => {
  const actual = jest.requireActual('expo-constants');
  const constants = actual.default ?? actual;
  // easConfig es de solo lectura: el Proxy deja todo igual y solo agrega el projectId.
  const withProjectId = new Proxy(constants, {
    get: (target, key) =>
      key === 'easConfig' ? { ...target.easConfig, projectId: 'proyecto-eas-de-prueba' } : Reflect.get(target, key, target),
  });
  return { __esModule: true, ...actual, default: withProjectId };
});

// expo-notifications (RF09) es un módulo nativo: en Jest se simula. Por defecto el permiso está
// concedido y el celular tiene un token de prueba; cada prueba puede cambiarlo con mockResolvedValue.
jest.mock('expo-notifications', () => ({
  AndroidImportance: { HIGH: 4, MAX: 5 },
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[prueba]' })),
  getLastNotificationResponse: jest.fn(() => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
