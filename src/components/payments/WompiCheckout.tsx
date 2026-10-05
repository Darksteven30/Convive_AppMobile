import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { Button } from '@/components/ui/Button';
import { OptionRow } from '@/components/ui/OptionRow';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { WOMPI_METHOD_LABELS, type PaymentCheckout, type WompiMethod } from '@/services/payments.service';
import { formatCurrency } from '@/utils/format';

const methodIcons: Record<WompiMethod, ComponentProps<typeof Ionicons>['name']> = {
  CARD: 'card-outline',
  PSE: 'globe-outline',
  NEQUI: 'phone-portrait-outline',
  BANCOLOMBIA_TRANSFER: 'business-outline',
  DAVIPLATA: 'phone-portrait-outline',
};

export type WompiResult = {
  method: WompiMethod;
  /** ID de la transacción en Wompi, p. ej. 12345-1757459940-67890. */
  wompiId: string;
};

type Props = {
  /** Transacción creada en el servidor; null mantiene la ventana cerrada. */
  checkout: PaymentCheckout | null;
  /** Medios habilitados en la cuenta Wompi del conjunto. */
  methods: WompiMethod[];
  /** La persona cerró la ventana sin pagar. */
  onClose: () => void;
  /** La persona terminó el pago en Wompi (el resultado lo confirma el servidor, RF13). */
  onComplete: (result: WompiResult) => void;
};

const randomDigits = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');

/**
 * Ventana de pago de Wompi SIMULADA. Reemplaza al Widget mientras no haya llaves de Sandbox: recibe
 * la referencia, el valor en centavos y la firma creados en el servidor, el valor no se puede editar
 * y el medio se elige aquí dentro. Convive no captura datos de tarjeta ni de cuenta.
 * Se monta con key={referencia} para que cada pago empiece sin medio elegido.
 */
export function WompiCheckout({ checkout, methods, onClose, onComplete }: Props) {
  const [method, setMethod] = useState<WompiMethod | null>(null);

  const pay = () => {
    if (!method) return;
    onComplete({ method, wompiId: `${randomDigits(5)}-${Math.floor(Date.now() / 1000)}-${randomDigits(5)}` });
  };

  return (
    <Modal visible={checkout !== null} animationType="slide" onRequestClose={onClose}>
      {checkout ? (
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.brand}>Wompi</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar ventana de Wompi" hitSlop={8} onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              Ventana simulada: la integración real con Wompi se conecta cuando el conjunto tenga sus llaves.
            </Text>
          </View>

          <View style={styles.summary}>
            <Text style={styles.label}>Valor a pagar</Text>
            <Text style={typography.amount}>{formatCurrency(checkout.amountInCents / 100)}</Text>
            <Text style={styles.label}>Referencia {checkout.reference}</Text>
          </View>

          <Text style={typography.subtitle}>Elige el medio de pago</Text>
          {methods.map((item) => (
            <OptionRow
              key={item}
              icon={methodIcons[item]}
              label={WOMPI_METHOD_LABELS[item]}
              selected={item === method}
              onPress={() => setMethod(item)}
            />
          ))}

          <View style={styles.footer}>
            <Button label="Pagar" variant="wompi" pill block disabled={!method} onPress={pay} />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.wompi,
  },
  notice: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  noticeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  summary: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
  },
  footer: {
    marginTop: 'auto',
  },
});
