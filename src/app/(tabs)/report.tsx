import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';

import { DateField } from '../../components/DateField.tsx';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Segmented,
  changeColor,
  colors,
  formatChange,
  formatValue,
  styles,
} from '../../components/ui.tsx';
import { listAssets, listEntriesUpTo, type Asset, type Entry } from '../../db/database.ts';
import { addMonths, todayISO } from '../../lib/dates.ts';
import {
  INTERVAL_LABELS,
  MAX_COLUMNS,
  buildColumns,
  buildReport,
  defaultRange,
  reportToCSV,
  type ReportInterval,
} from '../../lib/report.ts';

const INTERVALS = (Object.keys(INTERVAL_LABELS) as ReportInterval[]).map((value) => ({
  value,
  label: INTERVAL_LABELS[value],
}));

const NAME_WIDTH = 130;
const CELL_WIDTH = 110;
const ROW_HEIGHT = 44;

export default function ReportScreen() {
  const db = useSQLiteContext();
  const initial = defaultRange(todayISO());
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [interval, setIntervalKind] = useState<ReportInterval>('monthly');
  const [carryForward, setCarryForward] = useState(true);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([listAssets(db), listEntriesUpTo(db, to)]).then(([a, e]) => {
        setAssets(a);
        setEntries(e);
      });
    }, [db, to]),
  );

  const report = useMemo(() => {
    const { columns, truncated } = buildColumns(
      from,
      to,
      interval,
      entries.map((e) => e.date),
    );
    return buildReport(assets, entries, columns, carryForward, truncated);
  }, [assets, entries, from, to, interval, carryForward]);

  const setQuickRange = (months: number | 'ytd') => {
    const today = todayISO();
    setTo(today);
    setFrom(months === 'ytd' ? `${today.slice(0, 4)}-01-01` : addMonths(today, -months));
  };

  const shareCSV = async () => {
    try {
      await Share.share({ title: `Asset report ${from} to ${to}`, message: reportToCSV(report) });
    } catch (e) {
      Alert.alert('Could not share', String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Field label="From">
              <DateField value={from} onChange={setFrom} maximumDate={to} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="To">
              <DateField value={to} onChange={setTo} minimumDate={from} />
            </Field>
          </View>
        </View>
        <Segmented
          options={[
            { value: '3', label: 'Last 3 months' },
            { value: '12', label: 'Last 12 months' },
            { value: 'ytd', label: 'This year' },
            { value: '60', label: 'Last 5 years' },
          ]}
          value={'' as string}
          onChange={(v) => setQuickRange(v === 'ytd' ? 'ytd' : Number(v))}
        />
        <Field label="Date columns">
          <Segmented options={INTERVALS} value={interval} onChange={setIntervalKind} />
        </Field>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>Carry values forward</Text>
            <Text style={styles.muted}>
              {carryForward
                ? 'Each column shows the latest value on or before its date.'
                : 'Only show values recorded within each column’s period.'}
            </Text>
          </View>
          <Switch value={carryForward} onValueChange={setCarryForward} />
        </View>
      </Card>

      {report.columns.length === 0 || report.rows.length === 0 ? (
        <EmptyState
          title="Nothing to show"
          message={
            report.columns.length === 0
              ? 'There are no dates in this range. Adjust the range or the date columns option.'
              : 'No asset values were recorded on or before these dates.'
          }
        />
      ) : (
        <>
          {report.truncated && (
            <Text style={styles.muted}>
              Showing the first {MAX_COLUMNS} columns. Choose a shorter range or a longer interval to see more.
            </Text>
          )}
          <View style={table.container}>
            {/* Fixed asset-name column */}
            <View style={{ width: NAME_WIDTH }}>
              <View style={[table.cell, table.header, table.nameCell]}>
                <Text style={table.headerText}>Asset</Text>
              </View>
              {report.rows.map((r) => (
                <View key={r.assetId} style={[table.cell, table.nameCell]}>
                  <Text style={table.nameText} numberOfLines={2}>
                    {r.name}
                  </Text>
                </View>
              ))}
              <View style={[table.cell, table.nameCell, table.totalRow]}>
                <Text style={table.headerText}>Total</Text>
              </View>
            </View>
            {/* Scrollable date columns */}
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={{ flexDirection: 'row' }}>
                  {report.columns.map((c) => (
                    <View key={c.date} style={[table.cell, table.header, table.valueCell]}>
                      <Text style={table.headerText} numberOfLines={2}>
                        {c.label}
                      </Text>
                    </View>
                  ))}
                  <View style={[table.cell, table.header, table.valueCell]}>
                    <Text style={table.headerText}>Change</Text>
                  </View>
                </View>
                {report.rows.map((r) => (
                  <View key={r.assetId} style={{ flexDirection: 'row' }}>
                    {r.values.map((v, i) => (
                      <View key={report.columns[i].date} style={[table.cell, table.valueCell]}>
                        <Text style={[table.valueText, v === null && { color: colors.muted }]}>{formatValue(v)}</Text>
                      </View>
                    ))}
                    <View style={[table.cell, table.valueCell]}>
                      <Text style={[table.valueText, { color: changeColor(r.change) }]}>{formatChange(r.change)}</Text>
                    </View>
                  </View>
                ))}
                <View style={{ flexDirection: 'row' }}>
                  {report.totals.map((v, i) => (
                    <View key={report.columns[i].date} style={[table.cell, table.valueCell, table.totalRow]}>
                      <Text style={[table.valueText, { fontWeight: '700' }]}>{formatValue(v)}</Text>
                    </View>
                  ))}
                  <View style={[table.cell, table.valueCell, table.totalRow]}>
                    <Text style={[table.valueText, { fontWeight: '700', color: changeColor(report.totalChange) }]}>
                      {formatChange(report.totalChange)}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
          <Text style={styles.muted}>
            {report.rows.length} asset{report.rows.length === 1 ? '' : 's'} × {report.columns.length} date column
            {report.columns.length === 1 ? '' : 's'}. Scroll sideways to see all dates.
          </Text>
          <Button title="Share as CSV" variant="secondary" onPress={shareCSV} />
        </>
      )}
    </ScrollView>
  );
}

const table = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cell: {
    height: ROW_HEIGHT,
    paddingHorizontal: 8,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: { backgroundColor: colors.headerCell },
  nameCell: { width: NAME_WIDTH },
  valueCell: { width: CELL_WIDTH, alignItems: 'flex-end' },
  totalRow: { backgroundColor: colors.headerCell, borderBottomWidth: 0 },
  headerText: { fontSize: 13, fontWeight: '700', color: colors.text },
  nameText: { fontSize: 14, fontWeight: '600', color: colors.text },
  valueText: { fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
});
