// Los íconos son decorativos: se reemplazan por una vista con testID para no cargar fuentes en Jest.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  const Ionicons = ({ name }: { name: string }) => <View testID={`icon-${name}`} />;
  return { __esModule: true, default: Ionicons };
});

// expo-sqlite (almacenamiento de la sesión de Supabase) es un módulo nativo que no existe en Jest.
// Las pruebas usan el servicio simulado, así que basta con ignorar su instalación.
jest.mock('expo-sqlite/localStorage/install', () => ({}));
