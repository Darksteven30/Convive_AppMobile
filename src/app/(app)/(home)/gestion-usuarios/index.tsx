import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CommunityRow } from '@/components/community/CommunityRow';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { MSG } from '@/constants/messages';
import { roleLabels } from '@/constants/permissions';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { CommunityError, listPeople, type Person } from '@/services/community.service';

/**
 * RF20 · Personas del conjunto (administrador): quiénes están registrados, con su rol y unidad, y
 * quiénes aún no crean su cuenta. Desde aquí se pre-registra a alguien nuevo o se editan sus datos.
 */
export default function GestionUsuariosScreen() {
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [people, setPeople] = useState<Person[] | null>(null);

  // Se recarga al volver a la pantalla (p. ej. después de pre-registrar o editar).
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      let active = true;
      listPeople(user)
        .then((items) => active && setPeople(items))
        .catch((e) => {
          if (!active) return;
          setPeople([]);
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

  const pending = people?.filter((person) => !person.hasAccount).length ?? 0;

  return (
    <Screen
      header={<AppHeader title="Personas" left="back" showAvatar={false} />}
      footer={
        <Button label="Pre-registrar persona" variant="brand" pill block onPress={() => router.push('/gestion-usuarios/nuevo')} />
      }
    >
      {people === null ? (
        <ActivityIndicator color={colors.brandDark} style={styles.loading} />
      ) : people.length === 0 ? (
        <Text style={styles.empty}>{MSG.RF20.emptyPeople}</Text>
      ) : (
        <>
          <Text style={styles.summary}>
            {people.length} {people.length === 1 ? 'persona' : 'personas'}
            {pending > 0 ? ` · ${pending} sin crear su cuenta` : ''}
          </Text>
          <View>
            {people.map((person) => (
              <CommunityRow
                key={person.id}
                title={person.name}
                lines={[person.email, [roleLabels[person.role], person.unit && `Unidad ${person.unit}`].filter(Boolean).join(' · ')]}
                tag={person.hasAccount ? null : 'Sin cuenta'}
                accessibilityLabel={`Editar ${person.name}`}
                onPress={() => router.push({ pathname: '/gestion-usuarios/[id]', params: { id: person.id } })}
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
