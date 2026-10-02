import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Screen } from '@/components/layout/Screen';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colors, radius, spacing } from '@/constants/theme';
import { currentUser } from '@/data/mock';

export default function PerfilScreen() {
  return (
    <Screen header={<AppHeader left="back" />}>
      <View style={styles.identity}>
        <BrandLogo size={72} />
        <Text style={styles.name}>{currentUser.name}</Text>
        <Text style={styles.address}>{currentUser.address}</Text>
      </View>

      <SectionTitle title="Datos personales" />
      <View style={styles.data}>
        <DataRow label="Correo" value={currentUser.email} />
        <DataRow label="Teléfono" value={currentUser.phone} />
        <DataRow label="Casa" value={currentUser.house} />
      </View>

      <SectionTitle title="Seguridad" />
      <OptionRow
        icon="lock-closed-outline"
        label="Cambiar contraseña"
        onPress={() => router.push('/cambiar-contrasena')}
      />
    </Screen>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}:</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  name: {
    marginTop: spacing.sm,
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
  },
  address: {
    fontSize: 13,
    color: colors.textMuted,
  },
  data: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  dataRow: {
    flexDirection: 'row',
  },
  dataLabel: {
    width: 80,
    fontSize: 14,
    color: colors.text,
  },
  dataValue: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
});
