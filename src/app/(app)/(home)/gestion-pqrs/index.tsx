import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { PqrsStatusChip } from '@/components/pqrs/PqrsStatusChip';
import { MSG } from '@/constants/messages';
import { colors, spacing, typography } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { PqrsError, formatPqrsNumber, listConjuntoPqrs, pqrsTypeLabel, type PqrsSummary } from '@/services/pqrs.service';

/** RF08 · PQRS del conjunto (administrador): todas las solicitudes con su estado y quién las radicó. */
export default function GestionPqrsScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [items, setItems] = useState<PqrsSummary[] | null>(null);

  // Se recarga cada vez que la pantalla vuelve a tener el foco (p. ej. al cambiar un estado).
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listConjuntoPqrs(user)
        .then((list) => active && setItems(list))
        .catch((e) => {
          if (!active) return;
          setItems([]);
          if (e instanceof PqrsError && e.code === 'forbidden') {
            showDialog({ message: MSG.RF08.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
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
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="pqrs" />
        </>
      }
    >
      <Text accessibilityRole="header" style={typography.title}>
        PQRS del conjunto
      </Text>
      {items === null ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>{MSG.RF08.empty}</Text>
      ) : (
        <View>
          {items.map((item) => {
            const code = formatPqrsNumber(item.number);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Atender ${code}`}
                onPress={() => router.push({ pathname: '/gestion-pqrs/[id]', params: { id: item.id } })}
                style={styles.item}
              >
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle} numberOfLines={1}>
                    {code} — {pqrsTypeLabel(item.type)}
                  </Text>
                  <Text style={styles.itemOwner} numberOfLines={1}>
                    {item.owner}
                    {item.unit ? ` · Unidad ${item.unit}` : ''}
                  </Text>
                  <Text style={styles.itemDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                </View>
                <PqrsStatusChip status={item.status} />
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
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
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    color: colors.text,
  },
  itemOwner: {
    fontSize: 12,
    color: colors.text,
  },
  itemDescription: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
