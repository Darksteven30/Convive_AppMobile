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
import { getInitialBalance, isValidInitialBalance, setInitialBalance } from '@/services/summary.service';
import { amountInputFrom, formatAmount, formatAmountInput } from '@/utils/money';

/**
 * RF14 · Saldo inicial del conjunto (solo el administrador). Es el dinero que tenía el conjunto al
 * empezar a usar Convive: se suma a los ingresos y egresos en el «Saldo actual general» de General.
 */
export function InitialBalanceCard() {
  const { user } = useSession();
  const { showToast } = useFeedback();
  const [balance, setBalance] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(formatAmountInput(''));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    getInitialBalance(user)
      .then((value) => active && setBalance(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [user]);

  useFocusEffect(load);

  const startEditing = () => {
    setInput(amountInputFrom(balance ?? 0));
    setError(null);
    setEditing(true);
  };

  const save = async () => {
    if (!user || saving) return;
    if (!isValidInitialBalance(input.value)) {
      setError(MSG.RF14.initialBalanceInvalid);
      return;
    }
    setSaving(true);
    try {
      setBalance(await setInitialBalance(input.value, user));
      setEditing(false);
      showToast('success', MSG.RF14.initialBalanceSaved);
    } catch {
      showToast('error', MSG.general.unexpected);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Saldo inicial del conjunto">
      <Text style={styles.muted}>{MSG.RF14.initialBalanceHelp}</Text>
      {failed ? (
        <Button label="Reintentar" variant="outline" pill onPress={load} />
      ) : balance === null ? (
        <ActivityIndicator color={colors.brandDark} />
      ) : editing ? (
        <>
          <TextField
            accessibilityLabel="Saldo inicial"
            placeholder="$ 0"
            value={input.text}
            onChangeText={(text) => {
              setInput(formatAmountInput(text));
              setError(null);
            }}
            keyboardType="decimal-pad"
            error={error}
          />
          <View style={styles.row}>
            <Button label="Cancelar" variant="outline" pill onPress={() => setEditing(false)} />
            <Button label="Guardar" variant="success" pill loading={saving} onPress={save} />
          </View>
        </>
      ) : (
        <View style={styles.row}>
          <Text style={styles.value}>{formatAmount(balance)}</Text>
          <Button label="Editar" variant="outline" pill onPress={startEditing} />
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
