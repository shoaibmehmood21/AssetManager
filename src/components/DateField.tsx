import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

import { formatDisplayDate, isoToLocalDate, localDateToISO } from '../lib/dates.ts';
import { colors, styles } from './ui.tsx';

type Props = {
  /** ISO date string (YYYY-MM-DD). */
  value: string;
  onChange: (value: string) => void;
  minimumDate?: string;
  maximumDate?: string;
};

export function DateField({ value, onChange, minimumDate, maximumDate }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const min = minimumDate ? isoToLocalDate(minimumDate) : undefined;
  const max = maximumDate ? isoToLocalDate(maximumDate) : undefined;

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: isoToLocalDate(value),
        mode: 'date',
        minimumDate: min,
        maximumDate: max,
        onValueChange: (_event, date) => onChange(localDateToISO(date)),
      });
    } else {
      setIosOpen((o) => !o);
    }
  };

  return (
    <View>
      <Pressable accessibilityRole="button" onPress={open} style={[styles.input, { justifyContent: 'center' }]}>
        <Text style={{ fontSize: 16, color: colors.text }}>{formatDisplayDate(value)}</Text>
      </Pressable>
      {Platform.OS === 'ios' && iosOpen && (
        <DateTimePicker
          value={isoToLocalDate(value)}
          mode="date"
          display="inline"
          minimumDate={min}
          maximumDate={max}
          onValueChange={(_event, date) => {
            onChange(localDateToISO(date));
            setIosOpen(false);
          }}
          onDismiss={() => setIosOpen(false)}
        />
      )}
    </View>
  );
}
