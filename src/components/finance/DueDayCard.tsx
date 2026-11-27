import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { getDueDay, isValidDueDay, setDueDay } from '@/services/finance.service';

/** Texto del campo → día (null si está vacío; NaN si no es un número entero). */
function dayFrom(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

/**
 * RF09 · Día de vencimiento de la cuota (solo el administrador). Con él, la base de datos avisa
 * «Tu pago vence pronto» a las personas con saldo pendiente 5 días antes y el mismo día.
 */
export function DueDayCard() {
  const { user } = useSession();
  const { showToast } = useFeedback();
  // undefined = cargando; null = sin definir.
  const [day, setDay] = useState<number | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    getDueDay(user)
      .then((value) => active && setDay(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [user]);

  useFocusEffect(load);

  const startEditing = () => {
    setInput(day ? String(day) : '');
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!user || saving) return;
    const value = dayFrom(input);
    if (!isValidDueDay(value)) {
      setError(MSG.RF09.dueDayInvalid);
      return;
    }
    setSaving(true);
    try {
      setDay(await setDueDay(value, user));
      setEditing(false);
      showToast('success', MSG.RF09.dueDaySaved);
    } catch {
      showToast('error', MSG.general.unexpected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Vencimiento de la cuota">
      <Text style={styles.muted}>{MSG.RF09.dueDayHelp}</Text>
      {failed ? (
        <Button label="Reintentar" variant="outline" pill onPress={load} />
      ) : day === undefined ? (
        <ActivityIndicator color={colors.brandDark} />
      ) : editing ? (
        <>
          <TextField
            accessibilityLabel="Día de vencimiento"
            placeholder="Del 1 al 28"
            value={input}
            onChangeText={(text) => {
              setInput(text);
              setError(null);
            }}
            keyboardType="number-pad"
            maxLength={2}
            error={error}
          />
          <View style={styles.row}>
            <Button label="Cancelar" variant="outline" pill onPress={() => setEditing(false)} />
            <Button label="Guardar" variant="success" pill loading={saving} onPress={save} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.value}>{day ? MSG.RF09.dueDayValue(day) : MSG.RF09.dueDayNone}</Text>
          <Button
            label="Editar"
            accessibilityLabel="Editar día de vencimiento"
            variant="outline"
            pill
            onPress={startEditing}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  muted: {
    fontSize: 12,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
