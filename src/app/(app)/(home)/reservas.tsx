import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { SegmentedTabs } from '@/components/layout/SegmentedTabs';
import { Button } from '@/components/ui/Button';
import { Calendar, type DateRange } from '@/components/ui/Calendar';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { spacing } from '@/constants/theme';
import { zones } from '@/data/mock';

const formatDate = (date: Date) => date.toLocaleDateString('es-CO');

export default function ReservasScreen() {
  const [zone, setZone] = useState(zones[0]);
  const [range, setRange] = useState<DateRange>({ start: null, end: null });

  const book = () => {
    if (!range.start) {
      Alert.alert('Reserva', 'Selecciona al menos una fecha en el calendario.');
      return;
    }
    const dates = range.end
      ? `del ${formatDate(range.start)} al ${formatDate(range.end)}`
      : `el ${formatDate(range.start)}`;
    Alert.alert('Reserva agendada', `${zone} ${dates}.`);
  };

  return (
    <Screen
      header={
        <>
          <AppHeader />
          <SegmentedTabs active="reservas" />
        </>
      }
    >
      <Card title="Zona">
        <View style={styles.row}>
          {zones.map((item) => (
            <Chip key={item} label={item} selected={item === zone} onPress={() => setZone(item)} />
          ))}
        </View>
      </Card>

      <Calendar value={range} onChange={setRange} />

      <Button label="Agendar reserva" variant="success" pill onPress={book} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
