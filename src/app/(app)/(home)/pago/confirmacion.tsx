import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import type { ComponentProps } from 'react';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import {
  checkPaymentStatus,
  getPaymentResult,
  type PaymentResult,
  type PaymentStatusCode,
} from '@/services/payments.service';
import { exportReceiptPdf, receiptRows } from '@/services/receipt.service';

type ResultScreen = {
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  title: string;
  message: string;
};

/** Una pantalla por estado (MSG-RF13-01 a 05). */
const SCREENS: Record<PaymentStatusCode, ResultScreen> = {
  APROBADA: { icon: 'checkmark-circle-outline', color: colors.success, title: MSG.RF13.approvedTitle, message: MSG.RF13.approved },
  RECHAZADA: { icon: 'close-circle-outline', color: colors.danger, title: MSG.RF13.declinedTitle, message: MSG.RF13.declined },
  PENDIENTE: { icon: 'time-outline', color: colors.warning, title: MSG.RF13.pendingTitle, message: MSG.RF13.pending },
  ERROR: { icon: 'close-circle-outline', color: colors.danger, title: MSG.RF13.errorTitle, message: MSG.RF13.error },
  ANULADA: { icon: 'close-circle-outline', color: colors.danger, title: MSG.RF13.voidedTitle, message: MSG.RF13.voided },
  CANCELADA: { icon: 'close-circle-outline', color: colors.textMuted, title: MSG.RF13.cancelledTitle, message: MSG.RF12.cancelled },
};

/**
 * RF13 · Paso 3 del pago: resultado y comprobante. El estado se lee del servidor (que ya lo consultó
 * en Wompi, RF15), nunca de la ventana de pago. El saldo solo se descuenta si el pago es APROBADO.
 */
export default function PagoConfirmacionScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const { user } = useSession();
  const { showToast } = useFeedback();
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const show = (value: PaymentResult | null) => {
    setResult(value);
    setFailed(value === null);
  };

  // El pago se lee del servidor, que ya consultó su estado en Wompi.
  useEffect(() => {
    if (!user || !reference) return;
    let active = true;
    getPaymentResult(user, reference).then(
      (value) => active && show(value),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [user, reference]);

  const goHome = () => router.dismissTo('/inicio');

  // «Intentar de nuevo»: vuelve a Aplicar con el mismo concepto y valor; al pagar se crea una referencia nueva.
  const retry = () => {
    if (!result) return;
    router.replace({
      pathname: '/pago/aplicar',
      params: {
        concept: result.conceptId,
        conceptName: result.conceptName,
        amount: String(result.amount),
        ...(result.description ? { description: result.description } : {}),
      },
    });
  };

  // «Actualizar estado»: el servidor vuelve a consultar en Wompi; si cambió, se muestra la nueva pantalla.
  const refresh = async () => {
    if (!user || !reference) return;
    setRefreshing(true);
    try {
      await checkPaymentStatus(user, reference);
      const value = await getPaymentResult(user, reference);
      show(value);
      if (value?.status === 'PENDIENTE') {
        showToast('info', MSG.RF13.stillPending);
      }
    } catch {
      showToast('info', MSG.RF15.statusUnknown);
    } finally {
      setRefreshing(false);
    }
  };

  const downloadReceipt = async () => {
    if (!result || !user) return;
    setDownloading(true);
    try {
      await exportReceiptPdf(result, user);
      showToast('success', MSG.RF13.receiptDownloaded);
    } catch {
      showToast('error', MSG.RF13.receiptFailed);
    } finally {
      setDownloading(false);
    }
  };

  if (!result) {
    return (
      <Screen header={<AppHeader left="none" />}>
        {failed ? (
          <View style={styles.hero}>
            <Text style={styles.subtitle}>{MSG.RF13.notFound}</Text>
            <Button label="Volver al inicio" variant="secondary" pill block onPress={goHome} />
          </View>
        ) : (
          <ActivityIndicator accessibilityLabel="Consultando el pago" color={colors.brandDark} style={styles.loading} />
        )}
      </Screen>
    );
  }

  const screen = SCREENS[result.status];
  const approved = result.status === 'APROBADA';
  const canRetry = result.status === 'RECHAZADA' || result.status === 'ERROR';
  const pending = result.status === 'PENDIENTE';

  return (
    <Screen header={<AppHeader left="none" />}>
      <View style={styles.hero}>
        <Ionicons name={screen.icon} size={96} color={screen.color} />
        <SectionTitle title={screen.title} centered />
        <Text style={styles.subtitle}>{screen.message}</Text>
      </View>

      <View style={styles.table}>
        {receiptRows(result).map(([label, value]) => (
          <View key={label} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            <Text style={styles.tableValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        {canRetry ? <Button label="Intentar de nuevo" variant="success" pill block onPress={retry} /> : null}
        {pending ? (
          <Button label="Actualizar estado" variant="success" pill block loading={refreshing} onPress={refresh} />
        ) : null}
        {/* Verde en el pago exitoso, secundario en los demás. */}
        <Button label="Volver al inicio" variant={approved ? 'success' : 'secondary'} pill block onPress={goHome} />
        {approved ? (
          <Button
            label="Descargar comprobante"
            variant="secondary"
            pill
            block
            loading={downloading}
            onPress={downloadReceipt}
          />
        ) : null}
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
  loading: {
    marginTop: spacing.xxl,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
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
