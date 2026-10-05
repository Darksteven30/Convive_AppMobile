import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { WompiCheckout, type WompiResult } from '@/components/payments/WompiCheckout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { MSG } from '@/constants/messages';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  PaymentError,
  WOMPI_METHOD_LABELS,
  cancelPayment,
  getPaymentGateway,
  startPayment,
  type PaymentCheckout,
  type WompiMethod,
} from '@/services/payments.service';
import { formatCurrency } from '@/utils/format';

/** Sale del flujo de pago y deja la sección Pagos, aunque el pago se haya abierto desde Inicio. */
function goToPayments() {
  router.dismissAll();
  router.replace('/pagos');
}

/**
 * RF12 · Paso 2 del pago: resumen del concepto y del valor elegidos en RF11 y pago con Wompi.
 * El servidor crea la transacción PENDIENTE con referencia y firma; la ventana de Wompi recibe el
 * valor en centavos (no editable) y en ella se elige el medio. Convive no captura datos de pago.
 */
export default function PagoAplicarScreen() {
  const { concept, conceptName, amount, description } = useLocalSearchParams<{
    concept: string;
    conceptName: string;
    amount: string;
    description?: string;
  }>();
  const { user } = useSession();
  const { showDialog, showToast } = useFeedback();
  const [methods, setMethods] = useState<WompiMethod[]>([]);
  const [starting, setStarting] = useState(false);
  const [checkout, setCheckout] = useState<PaymentCheckout | null>(null);
  const value = Number(amount) || 0;

  // Chips informativos: solo los medios que el conjunto tiene habilitados en su cuenta Wompi.
  useEffect(() => {
    if (!user) return;
    let active = true;
    getPaymentGateway(user).then(
      (gateway) => active && setMethods(gateway.methods),
      () => active && setMethods([]),
    );
    return () => {
      active = false;
    };
  }, [user]);

  const pay = async () => {
    if (!user) return;
    setStarting(true);
    try {
      setCheckout(await startPayment(user, { conceptId: concept, amount: value, description }));
    } catch (error) {
      if (error instanceof PaymentError && error.code === 'pending') {
        showDialog({
          message: MSG.RF12.pendingPayment,
          actions: [
            // La pantalla con el estado del pago es del RF13; por ahora se ve en Pagos.
            { label: 'Ver estado', onPress: goToPayments },
            { label: 'Aceptar', primary: true },
          ],
        });
      } else if (error instanceof PaymentError && error.code === 'unavailable') {
        showDialog({ message: MSG.RF12.unavailable, actions: [{ label: 'Aceptar', primary: true }] });
      } else {
        showToast('error', MSG.RF12.startFailed);
      }
    } finally {
      setStarting(false);
    }
  };

  // Cerró la ventana de Wompi sin pagar: la transacción se cancela y no hubo cobro.
  const closeCheckout = () => {
    if (user && checkout) {
      cancelPayment(user, checkout.reference).catch(() => undefined);
    }
    setCheckout(null);
    showToast('info', MSG.RF12.cancelled);
  };

  // Terminó en Wompi: la transacción sigue PENDIENTE hasta que el servidor confirme el estado (RF13).
  const completeCheckout = ({ method, wompiId }: WompiResult) => {
    const reference = checkout?.reference ?? '';
    setCheckout(null);
    router.replace({
      pathname: '/pago/confirmacion',
      params: { conceptName, amount: String(value), method, reference, wompiId },
    });
  };

  return (
    <Screen
      header={<AppHeader left="cancel" onCancel={goToPayments} />}
      footer={<Button label="Volver" variant="secondary" pill block onPress={() => router.back()} />}
    >
      <SectionTitle title="Realizar pago" centered />
      <Card>
        <Text style={styles.label}>Concepto</Text>
        <Text style={styles.concept}>{conceptName ?? 'Pago'}</Text>
        {description ? <Text style={styles.label}>{description}</Text> : null}
        <Text style={styles.label}>Valor a pagar</Text>
        <Text style={typography.amount}>{formatCurrency(value)}</Text>
      </Card>

      <SectionTitle title="Medio de pago" />
      <Button label="Pagar con Wompi" variant="wompi" block loading={starting} onPress={pay} />

      {methods.length > 0 ? (
        <View style={styles.methods}>
          <Text style={styles.subtitle}>Medios disponibles en Wompi</Text>
          <View style={styles.chips}>
            {methods.map((method) => (
              <Text key={method} style={styles.chip}>
                {WOMPI_METHOD_LABELS[method]}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      <Text style={styles.security}>🔒 {MSG.RF12.securityNote}</Text>

      <WompiCheckout
        key={checkout?.reference ?? 'cerrada'}
        checkout={checkout}
        methods={methods}
        onClose={closeCheckout}
        onComplete={completeCheckout}
      />
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
  methods: {
    gap: spacing.sm,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    fontSize: 12,
    color: colors.text,
    overflow: 'hidden',
  },
  security: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
  },
});
