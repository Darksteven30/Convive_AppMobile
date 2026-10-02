import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors } from '@/constants/theme';

type Props = {
  size?: number;
};

export function BrandLogo({ size = 72 }: Props) {
  return (
    <View style={[styles.shadow, { borderRadius: size / 2 }]}>
      <LinearGradient
        colors={[colors.brand, colors.brandDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Ionicons name="home" size={size * 0.42} color={colors.onPrimary} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    alignSelf: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
