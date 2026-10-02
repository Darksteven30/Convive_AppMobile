// Los íconos son decorativos: se reemplazan por una vista con testID para no cargar fuentes en Jest.
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { View } = require('react-native');
  const Ionicons = ({ name }: { name: string }) => <View testID={`icon-${name}`} />;
  return { __esModule: true, default: Ionicons };
});
