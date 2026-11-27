import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MSG } from '@/constants/messages';
import { colors, spacing, typography } from '@/constants/theme';
import { useSession } from '@/context/SessionContext';
import { getPanelSummary, type PanelSummary } from '@/services/summary.service';
import { formatAmount } from '@/utils/money';

/**
 * Pantalla principal del administrador (RF01): indicadores de cartera y PQRS pendientes, calculados
 * con los datos del conjunto (resumen_panel() en Supabase). Desde aquí se accede a las PQRS del conjunto (RF08), a Finanzas (RF03), a Reportes (RF04), a los
 * comunicados (RF19) y a la administración de usuarios y unidades (RF20).
 */
export default function PanelScreen() {
  const { user } = useSession();
  const [summary, setSummary] = useState<PanelSummary | null>(null);
  const [failed, setFailed] = useState(false);

  // Se recarga cada vez que el Panel vuelve a tener el foco (p. ej. al volver de gestionar una PQRS).
  const load = useCallback(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    getPanelSummary(user)
      .then((value) => active && setSummary(value))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [user]);

  useFocusEffect(load);

  const indicator = (render: (value: PanelSummary) => ReactNode) =>
    failed ? (
      <View style={styles.failed}>
        <Text style={styles.muted}>{MSG.general.panelLoadFailed}</Text>
        <Button label="Reintentar" variant="outline" pill onPress={load} />
      </View>
    ) : summary === null ? (
      <ActivityIndicator color={colors.brandDark} />
    ) : (
      render(summary)
    );

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="panel" />
        </>
      }
    >
      <Text accessibilityRole="header" style={typography.title}>
        Panel de administración
      </Text>

      <Card title="Cartera por cobrar">
        {indicator(({ portfolioDue, unitsInArrears, totalUnits }) => (
          <>
            <Text style={typography.amount}>{formatAmount(portfolioDue)}</Text>
            <Text style={styles.muted}>
              {unitsInArrears} de {totalUnits} unidades en mora
            </Text>
          </>
        ))}
      </Card>

      <Card title="PQRS pendientes">
        {indicator(({ pendingPqrs }) => (
          <View style={styles.row}>
            <Text style={styles.count}>{pendingPqrs}</Text>
            <Text style={styles.muted}>{pendingPqrs === 1 ? 'solicitud sin responder' : 'solicitudes sin responder'}</Text>
          </View>
        ))}
        <Button label="Ver PQRS" variant="outline" pill onPress={() => router.push('/gestion-pqrs')} />
      </Card>

      <Card title="Finanzas">
        <Text style={styles.muted}>Registra ingresos y egresos con su categoría y soporte, y genera reportes por fecha y categoría.</Text>
        <View style={styles.actions}>
          <Button label="Registrar movimiento" variant="success" pill onPress={() => router.push('/finanzas/nuevo')} />
          <Button label="Ver movimientos" variant="outline" pill onPress={() => router.push('/finanzas')} />
          <Button label="Reportes" variant="outline" pill onPress={() => router.push('/reportes')} />
        </View>
      </Card>

      <Card title="Comunicados">
        <Text style={styles.muted}>Publica noticias y comunicados para todo el conjunto; se ven en Inicio.</Text>
        <View style={styles.actions}>
          <Button label="Publicar comunicado" variant="success" pill onPress={() => router.push('/gestion-noticias/nuevo')} />
          <Button label="Ver comunicados" variant="outline" pill onPress={() => router.push('/gestion-noticias')} />
        </View>
      </Card>

      <Card title="Usuarios y unidades">
        <Text style={styles.muted}>Pre-registra a las personas del conjunto con su rol y su unidad, y administra las unidades.</Text>
        <View style={styles.actions}>
          <Button label="Personas" variant="outline" pill onPress={() => router.push('/gestion-usuarios')} />
          <Button label="Unidades" variant="outline" pill onPress={() => router.push('/gestion-unidades')} />
        </View>
      </Card>

      <Button label="Ver resumen financiero" variant="outline" pill onPress={() => router.replace('/general')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  muted: {
    fontSize: 13,
    color: colors.textMuted,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  failed: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  count: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
  },
});
