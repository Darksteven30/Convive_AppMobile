import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { AccountStatusCard } from '@/components/payments/AccountStatusCard';
import { PaymentHistoryRow } from '@/components/payments/PaymentHistoryRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { MSG } from '@/constants/messages';
import { colors, spacing } from '@/constants/theme';
import { useFeedback } from '@/context/FeedbackContext';
import { useSession } from '@/context/SessionContext';
import { useAccountStatus } from '@/hooks/useAccountStatus';
import { usePaymentHistory } from '@/hooks/usePaymentHistory';
import {
  HISTORY_PAGE_SIZE,
  defaultHistoryFilters,
  validateHistoryFilters,
  type PaymentHistoryFilters,
} from '@/services/payments.service';
import { exportReceiptPdf } from '@/services/receipt.service';
import { todayISO } from '@/utils/date';

/**
 * RF02 · Estado de cuenta y descarga de comprobantes. El saldo y el historial son solo los de la
 * unidad del usuario: el servidor los filtra por la sesión, nunca por un dato que envíe la app.
 */
export default function PagosScreen() {
  const { user } = useSession();
  const { showToast } = useFeedback();
  const today = todayISO();

  const account = useAccountStatus();
  const [filters, setFilters] = useState<PaymentHistoryFilters>(() => defaultHistoryFilters(today));
  const errors = validateHistoryFilters(filters);
  const validPeriod = !errors.from;
  const history = usePaymentHistory(filters, validPeriod);

  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE);
  const [selected, setSelected] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const payments = history.payments ?? [];
  const selectedPayment = payments.find((payment) => payment.reference === selected) ?? null;

  // Un periodo nuevo es otra lista: vuelve a la primera página y quita la selección.
  const changePeriod = (field: keyof PaymentHistoryFilters) => (value: string) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setVisibleCount(HISTORY_PAGE_SIZE);
    setSelected(null);
  };

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([account.reload(), history.reload()]);
    setRefreshing(false);
  };

  const download = async () => {
    if (!selectedPayment || !user) return;
    setDownloading(true);
    try {
      await exportReceiptPdf(selectedPayment, user);
      showToast('success', MSG.RF02.receiptDownloaded);
    } catch {
      showToast('error', MSG.RF02.receiptFailed);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="pagos" />
        </>
      }
      onRefresh={refresh}
      refreshing={refreshing}
    >
      <AccountStatusCard
        status={account.status}
        loading={account.loading}
        failed={account.failed}
        onRetry={account.reload}
      />

      <Card title="Historial de pagos">
        <View style={styles.dates}>
          <View style={styles.dateColumn}>
            <DateField
              label="Fecha inicial"
              value={filters.from}
              maxDate={today}
              onChange={changePeriod('from')}
              error={errors.from}
            />
          </View>
          <View style={styles.dateColumn}>
            <DateField label="Fecha final" value={filters.to} maxDate={today} onChange={changePeriod('to')} />
          </View>
        </View>

        {!validPeriod ? null : history.failed ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{MSG.RF02.loadFailed}</Text>
            <Button label="Reintentar" variant="outline" pill onPress={history.reload} />
          </View>
        ) : history.loading ? (
          <ActivityIndicator accessibilityLabel="Cargando historial" color={colors.brandDark} style={styles.loading} />
        ) : payments.length === 0 ? (
          <View style={styles.state}>
            <Ionicons name="receipt-outline" size={40} color={colors.placeholder} />
            <Text style={styles.stateText}>{MSG.RF02.noPayments}</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {payments.slice(0, visibleCount).map((payment) => (
              <PaymentHistoryRow
                key={payment.reference}
                payment={payment}
                selected={payment.reference === selected}
                onPress={() => setSelected((current) => (current === payment.reference ? null : payment.reference))}
              />
            ))}
            {payments.length > visibleCount ? (
              <Button
                label="Ver más"
                variant="outline"
                pill
                onPress={() => setVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
              />
            ) : null}
          </View>
        )}

        <Button
          label="Descargar comprobante"
          variant="success"
          pill
          disabled={!selectedPayment}
          loading={downloading}
          onPress={download}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dates: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dateColumn: {
    flex: 1,
  },
  list: {
    gap: spacing.sm,
  },
  loading: {
    paddingVertical: spacing.lg,
  },
  state: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  stateText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
