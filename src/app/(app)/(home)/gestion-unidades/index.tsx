import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CommunityRow } from '@/components/community/CommunityRow';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { CommunityError, listUnits, type CommunityUnit } from '@/services/community.service';

/**
 * RF20 · Unidades del conjunto (administrador): casas, apartamentos y oficinas, con cuántas personas
 * tiene cada una. Las unidades no se eliminan para no perder sus pagos, reservas y visitas.
 */
export default function GestionUnidadesScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [units, setUnits] = useState<CommunityUnit[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listUnits(user)
        .then((items) => active && setUnits(items))
        .catch((e) => {
          if (!active) return;
          setUnits([]);
          if (e instanceof CommunityError && e.code === 'forbidden') {
            showDialog({ message: MSG.RF20.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
          } else {
            showToast('error', MSG.general.unexpected);
          }
        });
      return () => {
        active = false;
      };
    }, [user, showDialog, showToast]),
  );

  return (
    <Screen
      header={<AppHeader title="Unidades" left="back" showAvatar={false} />}
      footer={<Button label="Nueva unidad" variant="brand" pill block onPress={() => router.push('/gestion-unidades/nueva')} />}
    >
      {units === null ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : units.length === 0 ? (
        <Text style={styles.empty}>{MSG.RF20.emptyUnits}</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {units.length} {units.length === 1 ? 'unidad' : 'unidades'}
          </Text>
          <View>
            {units.map((unit) => (
              <CommunityRow
                key={unit.id}
                title={unit.name}
                lines={[unit.address, unit.people === 1 ? '1 persona' : `${unit.people} personas`]}
                accessibilityLabel={`Editar unidad ${unit.name}`}
                onPress={() => router.push({ pathname: '/gestion-unidades/[id]', params: { id: unit.id } })}
              />
            ))}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  empty: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  summary: {
    fontSize: 13,
    color: colors.textMuted,
  },
});
