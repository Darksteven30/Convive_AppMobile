import { useState } from 'react';
import { router } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { BalanceCard } from '@/components/ui/BalanceCard';
import { Button } from '@/components/ui/Button';
import { OptionRow } from '@/components/ui/OptionRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { accountBalance, paymentConcepts } from '@/data/mock';

/** Paso 1 del pago: selección del concepto. */
export default function PagoSeleccionScreen() {
  const [concept, setConcept] = useState<string | null>(null);

  return (
    <Screen
      header={<AppHeader left="cancel" />}
      footer={
        <Button
          label="Continuar"
          variant="success"
          pill
          block
          disabled={!concept}
          onPress={() => concept && router.push({ pathname: '/pago/aplicar', params: { concept } })}
        />
      }
    >
      <SectionTitle title="Efectuar pago" centered />
      <BalanceCard amount={accountBalance} />
      <SectionTitle title="Seleccione el concepto" />
      {paymentConcepts.map((item) => (
        <OptionRow
          key={item.id}
          icon="document-text-outline"
          label={item.label}
          selected={item.id === concept}
          onPress={() => setConcept(item.id)}
        />
      ))}
    </Screen>
  );
}
