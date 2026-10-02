import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colors, spacing } from '@/constants/theme';
import { accountBalance, paymentConcepts, paymentMethods } from '@/data/mock';
import { formatCurrency } from '@/utils/format';

/** Paso 3 del pago: comprobante de pago exitoso. */
export default function PagoConfirmacionScreen() {
  const { concept, method } = useLocalSearchParams<{ concept: string; method: string }>();

  const details = useMemo(() => {
    const now = new Date();
    return [
      ['Concepto', paymentConcepts.find((item) => item.id === concept)?.label ?? '—'],
      ['Valor pagado', formatCurrency(accountBalance)],
      ['Fecha', `${now.toLocaleDateString('es-CO')} - ${now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`],
      ['Medio de pago', paymentMethods.find((item) => item.id === method)?.label ?? '—'],
      ['Referencia', `#${now.getTime().toString().slice(-8)}`],
    ];
  }, [concept, method]);

  return (
    <Screen header={<AppHeader left="none" />}>
      <View style={styles.hero}>
        <Ionicons name="checkmark-circle-outline" size={96} color={colors.success} />
        <SectionTitle title="Pago exitoso" centered />
        <Text style={styles.subtitle}>Tu pago ha sido procesado correctamente</Text>
      </View>

      <View style={styles.table}>
        {details.map(([label, value]) => (
          <View key={label} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Button label="Volver al inicio" variant="success" pill block onPress={() => router.dismissTo('/inicio')} />
        <Button
          label="Descargar comprobante"
          variant="secondary"
          pill
          block
          onPress={() => Alert.alert('Comprobante', 'La descarga estará disponible próximamente.')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.text,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableLabel: {
    width: 120,
    fontSize: 13,
    color: colors.text,
  },
  tableValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  actions: {
    gap: spacing.sm,
  },
});
