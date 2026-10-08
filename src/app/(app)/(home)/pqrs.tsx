import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { colors, radius, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { pqrsList, type Pqrs } from '@/data/mock';

export default function PqrsScreen() {
  const [items, setItems] = useState<Pqrs[]>(pqrsList);
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const { showToast } = useFeedback();

  const submit = () => {
    if (!type.trim() || !description.trim()) {
      showToast('error', 'Completa el tipo y la descripción.');
      return;
    }
    const next = Math.max(...items.map((item) => Number(item.code.slice(1))), 0) + 1;
    const code = `#${String(next).padStart(4, '0')}`;
    setItems([{ id: `p${next}`, code, title: type.trim() }, ...items]);
    setType('');
    setDescription('');
    showToast('success', `Tu solicitud ${code} fue registrada.`);
  };

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs />
        </>
      }
    >
      <View>
        {items.map((item) => (
          <View key={item.id} style={styles.item}>
            <Ionicons name="star-outline" size={18} color={colors.text} />
            <Text style={styles.itemText}>
              {item.code} — {item.title}
            </Text>
            <Ionicons name="caret-forward" size={12} color={colors.text} />
          </View>
        ))}
      </View>

      <Card>
        <Text style={styles.formTitle}>Nueva PQRS</Text>
        <TextField label="Tipo" value={type} onChangeText={setType} />
        <TextField label="Descripción" value={description} onChangeText={setDescription} multiline />
        <Text style={styles.photoLabel}>Foto</Text>
        <Pressable
          accessibilityLabel="Adjuntar foto"
          style={styles.photo}
          onPress={() => showToast('info', 'La carga de fotos estará disponible próximamente.')}
        >
          <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
        </Pressable>
        <Button label="Radicar" variant="brand" onPress={submit} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  formTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.brandDark,
  },
  photoLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  photo: {
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
