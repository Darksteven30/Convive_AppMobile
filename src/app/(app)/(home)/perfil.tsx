import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { Screen } from '@/components/layout/Screen';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { roleLabels } from '@/constants/permissions';
import { colors, radius, spacing } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';

export default function PerfilScreen() {
  const { user, signOut } = useSession();

  // Al cerrar sesión hay un render sin usuario antes de que la pantalla se desmonte.
  if (!user) return null;

  return (
    <Screen header={<AppHeader left="back" />}>
      <View style={styles.identity}>
        <BrandLogo size={72} />
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.address}>{user.address}</Text>
        <Text style={styles.role}>{roleLabels[user.role]}</Text>
      </View>

      <SectionTitle title="Datos personales" />
      <View style={styles.data}>
        <DataRow label="Correo" value={user.email} />
        <DataRow label="Teléfono" value={user.phone} />
        <DataRow label="Casa" value={user.house} />
      </View>

      <SectionTitle title="Seguridad" />
      <OptionRow
        icon="lock-closed-outline"
        label="Cambiar contraseña"
        onPress={() => router.push('/cambiar-contrasena')}
      />
      <OptionRow icon="log-out-outline" label="Cerrar sesión" onPress={signOut} />
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
  role: {
    marginTop: spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    fontSize: 12,
    fontWeight: '600',
    color: colors.brandDark,
    overflow: 'hidden',
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
