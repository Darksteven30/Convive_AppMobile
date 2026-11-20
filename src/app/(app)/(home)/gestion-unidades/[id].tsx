import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { UnitForm } from '@/components/community/UnitForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { listUnits, saveUnit, type CommunityUnit, type UnitInput } from '@/services/community.service';

/** RF20 · Editar el nombre y la dirección de una unidad (administrador). */
export default function EditarUnidadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { showToast } = useFeedback();
  const [unit, setUnit] = useState<CommunityUnit | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    listUnits(user)
      .then((items) => {
        if (!active) return;
        const found = items.find((item) => item.id === id);
        if (found) setUnit(found);
        else setLoadError(MSG.RF20.notFound);
      })
      .catch(() => active && setLoadError(MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  const save = async (input: UnitInput) => {
    if (!user || !unit) return;
    await saveUnit(unit.id, input, user);
    showToast('success', MSG.RF20.unitSaved);
    router.back();
  };

  if (!unit) {
    return (
      <Screen header={<AppHeader title="Editar unidad" left="back" showAvatar={false} />}>
        {loadError ? (
          <Text style={styles.muted}>{loadError}</Text>
        ) : (
          <ActivityIndicator color={colors.brandDark} style={styles.loading} />
        )}
      </Screen>
    );
  }

  return <UnitForm title="Editar unidad" initial={{ name: unit.name, address: unit.address ?? '' }} onSubmit={save} />;
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.lg,
  },
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
