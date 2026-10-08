import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { TextField } from '@/components/ui/TextField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useAccountStatus } from '@/hooks/useAccountStatus';
import { DESCRIPTION_MAX, validatePaymentSelection, type PaymentConcept } from '@/services/payments.service';
import { amountInputFrom, formatAmount, formatAmountInput } from '@/utils/money';

/**
 * RF11 · Paso 1 del pago: selección del concepto y del valor a pagar.
 * El saldo de cada concepto sale del estado de la cuenta de la unidad (Supabase o datos simulados).
 */
export default function PagoSeleccionScreen() {
  const { status, failed, loading, reload } = useAccountStatus();
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [amountDirty, setAmountDirty] = useState(false);
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  // Se tocó «Continuar» sin completar: se muestran todos los mensajes pendientes.
  const [attempted, setAttempted] = useState(false);

  const concepts = status?.concepts ?? [];
  const concept = concepts.find((item) => item.id === conceptId);
  const errors = validatePaymentSelection({ conceptId, amount, description }, concepts);
  const valid = Object.keys(errors).length === 0;
  // Un concepto sin saldo arranca vacío: no se marca en rojo hasta que escriban o intenten continuar.
  const amountError = amountDirty || attempted ? errors.amount : undefined;
  const descriptionError = descriptionTouched || attempted ? errors.description : undefined;

  const selectConcept = (item: PaymentConcept) => {
    // Por defecto se propone el saldo completo; se puede disminuir para un abono parcial.
    const initial = item.balance > 0 ? amountInputFrom(item.balance) : { text: '', value: null };
    setConceptId(item.id);
    setAmountText(initial.text);
    setAmount(initial.value);
    setAmountDirty(false);
    setDescription('');
    setDescriptionTouched(false);
    setAttempted(false);
  };

  const changeAmount = (text: string) => {
    const formatted = formatAmountInput(text);
    setAmountText(formatted.text);
    setAmount(formatted.value);
    setAmountDirty(true);
  };

  // Vuelve a la pantalla desde donde se abrió (Inicio o Pagos) sin guardar nada.
  const cancel = () => (router.canGoBack() ? router.back() : router.dismissTo('/inicio'));

  const next = () => {
    if (!valid || !concept || amount === null) return;
    router.push({
      pathname: '/pago/aplicar',
      params: {
        concept: concept.id,
        conceptName: concept.name,
        amount: String(amount),
        ...(concept.requiresDescription && { description: description.trim() }),
      },
    });
  };

  return (
    <Screen
      header={<AppHeader left="cancel" onCancel={cancel} />}
      footer={
        // El botón se ve deshabilitado, pero al tocarlo explica qué falta (mensajes en línea): el toque
        // llega a este contenedor solo cuando el botón está deshabilitado.
        <Pressable accessible={false} onPress={() => setAttempted(true)}>
          <Button label="Continuar" variant="success" pill block disabled={!valid} onPress={next} />
        </Pressable>
      }
    >
      <SectionTitle title="Efectuar pago" centered />
      <BalanceCard amount={status?.total ?? null} loading={loading} />

      {failed ? (
        <Card>
          <Text style={styles.text}>{MSG.general.unexpected}</Text>
          <Button label="Reintentar" variant="outline" pill onPress={reload} />
        </Card>
      ) : status ? (
        <>
          {status.total <= 0 ? (
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
              <Text style={styles.emptyTitle}>{MSG.RF11.upToDateTitle}</Text>
              <Text style={styles.text}>{MSG.RF11.upToDateMessage}</Text>
            </View>
          ) : null}

          <SectionTitle title="Seleccione el concepto" />
          {concepts.map((item) => (
            <OptionRow
              key={item.id}
              icon="document-text-outline"
              label={item.name}
              description={item.balance > 0 ? `Saldo pendiente: ${formatAmount(item.balance)}` : 'Sin saldo pendiente'}
              selected={item.id === conceptId}
              onPress={() => selectConcept(item)}
            />
          ))}
          {attempted && errors.concept ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {errors.concept}
            </Text>
          ) : null}

          {concept ? (
            <Card>
              <TextField
                label="Valor a pagar"
                placeholder="$ 0"
                value={amountText}
                onChangeText={changeAmount}
                onBlur={() => setAmountDirty(true)}
                error={amountError}
                keyboardType="decimal-pad"
              />
              {amountError ? null : (
                <Text style={styles.hint}>{concept.balance > 0 ? MSG.RF11.partialHint : MSG.RF11.noBalanceHint}</Text>
              )}
              {concept.requiresDescription ? (
                <TextField
                  label="Descripción"
                  placeholder="¿Qué estás pagando?"
                  value={description}
                  onChangeText={setDescription}
                  onBlur={() => setDescriptionTouched(true)}
                  error={descriptionError}
                  maxLength={DESCRIPTION_MAX}
                  showCounter
                />
              ) : null}
            </Card>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  text: {
    fontSize: 14,
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
  },
  error: {
    fontSize: 12,
    color: colors.danger,
  },
});
