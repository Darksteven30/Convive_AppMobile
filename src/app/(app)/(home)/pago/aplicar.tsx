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
import { paymentMethods } from '@/data/mock';
import { formatCurrency } from '@/utils/format';

const methodIcons: Record<string, ComponentProps<typeof Ionicons>['name']> = {
  pse: 'globe-outline',
  tarjeta: 'card-outline',
  nequi: 'phone-portrait-outline',
};

/** Paso 2 del pago: resumen del concepto y del valor elegidos en RF11, y selección del medio de pago. */
export default function PagoAplicarScreen() {
  const { concept, conceptName, amount, description } = useLocalSearchParams<{
    concept: string;
    conceptName: string;
    amount: string;
    description?: string;
  }>();
  const [method, setMethod] = useState<string | null>(null);

  // Abandona el pago y lleva a Pagos aunque se haya abierto desde Inicio: se cierra el flujo
  // (queda la sección desde donde se abrió) y esa sección se reemplaza por Pagos.
  const cancel = () => {
    router.dismissAll();
    router.replace('/pagos');
  };

  return (
    <Screen
      header={<AppHeader left="cancel" onCancel={cancel} />}
      footer={
        <Button
          label="Continuar"
          variant="success"
          pill
          block
          disabled={!method}
          onPress={() =>
            method && router.replace({ pathname: '/pago/confirmacion', params: { concept, conceptName, amount, method } })
          }
        />
      }
    >
      <SectionTitle title="Realizar pago" centered />
      <Card>
        <Text style={styles.label}>Concepto</Text>
        <Text style={styles.concept}>{conceptName ?? 'Pago'}</Text>
        {description ? <Text style={styles.label}>{description}</Text> : null}
        <Text style={styles.label}>Valor a pagar</Text>
        <Text style={typography.amount}>{formatCurrency(Number(amount) || 0)}</Text>
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
