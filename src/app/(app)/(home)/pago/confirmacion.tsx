import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { colors, spacing } from '@/constants/theme';
import { WOMPI_METHOD_LABELS, type WompiMethod } from '@/services/payments.service';
import { formatCurrency } from '@/utils/format';

/** Paso 3 del pago: comprobante de pago exitoso. */
export default function PagoConfirmacionScreen() {
  const { conceptName, amount, method, reference, wompiId } = useLocalSearchParams<{
    conceptName: string;
    amount: string;
    method: WompiMethod;
    reference: string;
    wompiId: string;
  }>();

  const details = useMemo(() => {
    const now = new Date();
    return [
      ['Concepto', conceptName ?? '—'],
      ['Valor pagado', formatCurrency(Number(amount) || 0)],
      ['Fecha', `${now.toLocaleDateString('es-CO')} - ${now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`],
      ['Medio de pago', WOMPI_METHOD_LABELS[method] ? `${WOMPI_METHOD_LABELS[method]} (vía Wompi)` : '—'],
      ['Referencia', reference ?? '—'],
      ['ID Wompi', wompiId ?? '—'],
    ];
  }, [conceptName, amount, method, reference, wompiId]);

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
