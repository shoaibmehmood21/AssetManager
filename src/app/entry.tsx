import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '../components/DateField.tsx';
import { Button, Field, Input, colors, styles } from '../components/ui.tsx';
import { addEntry, deleteEntry, getEntry, listAssets, updateEntry, type Asset } from '../db/database.ts';
import { todayISO } from '../lib/dates.ts';

/** Parse user-typed numbers, accepting thousands separators. */
function parseValue(text: string): number | null {
  const cleaned = text.replace(/[\s,]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function EntryScreen() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ entryId?: string; assetName?: string }>();
  const entryId = params.entryId ? Number(params.entryId) : null;

  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetName, setAssetName] = useState(params.assetName ?? '');
  const [date, setDate] = useState(todayISO());
  const [valueText, setValueText] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listAssets(db).then(setAssets);
    if (entryId !== null) {
      getEntry(db, entryId).then((e) => {
        if (!e) return;
        setAssetName(e.assetName);
        setDate(e.date);
        setValueText(String(e.value));
        setNote(e.note);
      });
    }
  }, [db, entryId]);

  const suggestions = useMemo(() => {
    const q = assetName.trim().toLowerCase();
    return assets
      .filter((a) => a.name.toLowerCase() !== q && (q === '' || a.name.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [assets, assetName]);

  const save = async () => {
    const name = assetName.trim();
    const value = parseValue(valueText);
    if (!name) return Alert.alert('Missing asset', 'Enter an asset name.');
    if (value === null) return Alert.alert('Invalid value', 'Enter a number for the value.');
    setSaving(true);
    try {
      const input = { assetName: name, date, value, note };
      if (entryId !== null) await updateEntry(db, entryId, input);
      else await addEntry(db, input);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (entryId === null) return;
    Alert.alert('Delete entry?', 'This entry will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, entryId);
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: entryId !== null ? 'Edit entry' : 'Add entry' }} />
      <ScrollView contentContainerStyle={[styles.content, { gap: 16 }]} keyboardShouldPersistTaps="handled">
        <Field label="Asset">
          <Input value={assetName} onChangeText={setAssetName} placeholder="e.g. House, Car, Savings" autoCapitalize="words" />
          {suggestions.length > 0 && (
            <View style={styles.segmented}>
              {suggestions.map((a) => (
                <Pressable key={a.id} onPress={() => setAssetName(a.name)} style={styles.segment}>
                  <Text style={styles.segmentText}>{a.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Field>
        <Field label="Date">
          <DateField value={date} onChange={setDate} />
        </Field>
        <Field label="Value">
          <Input
            value={valueText}
            onChangeText={setValueText}
            placeholder="0.00"
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
          />
        </Field>
        <Field label="Note">
          <Input
            value={note}
            onChangeText={setNote}
            placeholder="Optional"
            multiline
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
        </Field>
        <Button title={entryId !== null ? 'Save changes' : 'Save entry'} onPress={save} loading={saving} />
        {entryId !== null && <Button title="Delete entry" variant="danger" onPress={remove} />}
        <Text style={[styles.muted, { textAlign: 'center', color: colors.muted }]}>
          A new asset is created automatically when you use a new name.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
