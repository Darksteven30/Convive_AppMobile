import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { PersonForm } from '@/components/community/PersonForm';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  CommunityError,
  deletePreregistration,
  listPeople,
  updatePerson,
  type Person,
  type PersonInput,
} from '@/services/community.service';
import { formatPhone } from '@/utils/validation';

/**
 * RF20 · Editar a una persona (administrador): nombre, teléfono, rol y unidad; el correo solo
 * mientras no haya creado su cuenta. Un pre-registro sin cuenta también se puede eliminar.
 */
export default function EditarPersonaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [person, setPerson] = useState<Person | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !id) return;
    let active = true;
    listPeople(user)
      .then((items) => {
        if (!active) return;
        const found = items.find((item) => item.id === id);
        if (found) setPerson(found);
        else setLoadError(MSG.RF20.notFound);
      })
      .catch(() => active && setLoadError(MSG.general.unexpected));
    return () => {
      active = false;
    };
  }, [id, user]);

  const save = async (input: PersonInput) => {
    if (!user || !person) return;
    await updatePerson(person.id, input, user);
    showToast('success', MSG.RF20.personUpdated);
    router.back();
  };

  const remove = async () => {
    if (!user || !person) return;
    try {
      await deletePreregistration(person.id, user);
      showToast('success', MSG.RF20.preregistrationDeleted);
      router.back();
    } catch (e) {
      if (e instanceof CommunityError && e.code === 'has_account') {
        showDialog({ message: MSG.RF20.hasAccount, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof CommunityError && e.code === 'forbidden') {
        showDialog({ message: MSG.RF20.forbidden, actions: [{ label: 'Aceptar', primary: true }] });
      } else if (e instanceof CommunityError && e.code === 'not_found') {
        router.back();
      } else {
        showToast('error', MSG.general.unexpected);
      }
    }
  };

  const confirmDelete = () =>
    showDialog({
      title: MSG.RF20.deleteTitle,
      message: MSG.RF20.deleteMessage,
      actions: [{ label: 'Eliminar', primary: true, onPress: remove }, { label: 'Cancelar' }],
    });

  if (!person) {
    return (
      <Screen header={<AppHeader title="Editar persona" left="back" showAvatar={false} />}>
        {loadError ? (
          <Text style={styles.muted}>{loadError}</Text>
        ) : (
          <ActivityIndicator color={colors.brandDark} style={styles.loading} />
        )}
      </Screen>
    );
  }

  return (
    <PersonForm
      title="Editar persona"
      submitLabel="Guardar cambios"
      initial={{
        name: person.name,
        email: person.email,
        phone: person.phone ? formatPhone(person.phone) : '',
        role: person.role,
        unitId: person.unitId,
      }}
      emailLocked={person.hasAccount}
      onSubmit={save}
      onDelete={person.hasAccount ? undefined : confirmDelete}
    />
  );
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
