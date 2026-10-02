import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colors, typography } from '@/constants/theme';
import { accountBalance, paymentConcepts, paymentMethods } from '@/data/mock';
import { formatCurrency } from '@/utils/format';

const methodIcons: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  pse: 'globe-outline',
  tarjeta: 'card-outline',
  nequi: 'phone-portrait-outline',
};

/** Paso 2 del pago: resumen del concepto y selección del medio de pago. */
export default function PagoAplicarScreen() {
  const { concept } = useLocalSearchParams<{ concept: string }>();
  const [method, setMethod] = useState<string | null>(null);
  const conceptLabel = paymentConcepts.find((item) => item.id === concept)?.label ?? 'Pago';

  return (
    <Screen
      header={<AppHeader left="cancel" />}
      footer={
        <Button
          label="Continuar"
          variant="success"
          pill
          block
          disabled={!method}
          onPress={() =>
            method && router.replace({ pathname: '/pago/confirmacion', params: { concept, method } })
          }
        />
      }
    >
      <SectionTitle title="Realizar pago" centered />
      <Card>
        <Text style={styles.label}>Concepto</Text>
        <Text style={styles.concept}>{conceptLabel}</Text>
        <Text style={styles.label}>Valor a pagar</Text>
        <Text style={typography.amount}>{formatCurrency(accountBalance)}</Text>
      </Card>

      <SectionTitle title="Seleccione el medio de pago" />
      {paymentMethods.map((item) => (
        <OptionRow
          key={item.id}
          icon={methodIcons[item.id] ?? 'cash-outline'}
          label={item.label}
          description={item.description}
          selected={item.id === method}
          onPress={() => setMethod(item.id)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    color: colors.textMuted,
  },
  concept: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});
