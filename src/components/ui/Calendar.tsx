import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { colors, radius, spacing } from '@/constants/theme';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];

export type DateRange = { start: Date | null; end: Date | null };

type Props = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

type Cell = { date: Date; inMonth: boolean };

const sameDay = (a: Date | null, b: Date) =>
  !!a && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Calendario mensual con selección de rango (primer toque: inicio, segundo: fin). */
export function Calendar({ value, onChange }: Props) {
  const [visible, setVisible] = useState(() => {
    const base = value.start ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const weeks = useMemo(() => buildWeeks(visible), [visible]);

  const changeMonth = (delta: number) =>
    setVisible((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  const handlePress = (date: Date) => {
    const { start, end } = value;
    if (!start || end || date < start) {
      onChange({ start: date, end: null });
    } else {
      onChange({ start, end: date });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Mes anterior" onPress={() => changeMonth(-1)} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.selectors}>
          <Text style={styles.selector}>{MONTHS[visible.getMonth()]}</Text>
          <Text style={styles.selector}>{visible.getFullYear()}</Text>
        </View>
        <Pressable accessibilityLabel="Mes siguiente" onPress={() => changeMonth(1)} hitSlop={8}>
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={[styles.cell, styles.weekday]}>
            {day}
          </Text>
        ))}
      </View>

      {weeks.map((week, index) => (
        <View key={index} style={styles.week}>
          {week.map(({ date, inMonth }) => {
            const isEdge = sameDay(value.start, date) || sameDay(value.end, date);
            const inRange = !!value.start && !!value.end && date > value.start && date < value.end;
            return (
              <Pressable
                key={date.toISOString()}
                disabled={!inMonth}
                onPress={() => handlePress(date)}
                style={[styles.cell, styles.day, inRange && styles.inRange, isEdge && styles.edge]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    !inMonth && styles.outside,
                    isEdge && styles.edgeLabel,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function buildWeeks(month: Date): Cell[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  const weeks: Cell[][] = [];
  const cursor = new Date(start);
  do {
    const week: Cell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ date: new Date(cursor), inMonth: cursor.getMonth() === month.getMonth() });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month.getMonth());
  return weeks;
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  selectors: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  selector: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    margin: 2,
    textAlign: 'center',
  },
  weekday: {
    fontSize: 11,
    color: colors.textMuted,
    aspectRatio: undefined,
  },
  day: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dayLabel: {
    fontSize: 14,
    color: colors.text,
  },
  outside: {
    color: colors.placeholder,
  },
  inRange: {
    backgroundColor: colors.surface,
  },
  edge: {
    backgroundColor: colors.primary,
  },
  edgeLabel: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
});
