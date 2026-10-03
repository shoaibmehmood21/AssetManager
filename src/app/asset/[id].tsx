import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, Input, changeColor, colors, formatChange, formatValue, styles } from '../../components/ui.tsx';
import { deleteAsset, getAsset, listEntriesForAsset, renameAsset, type Asset, type Entry } from '../../db/database.ts';
import { formatDisplayDate } from '../../lib/dates.ts';

export default function AssetScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const assetId = Number(id);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const a = await getAsset(db, assetId);
    if (!a) {
      router.back();
      return;
    }
    setAsset(a);
    setEntries(await listEntriesForAsset(db, assetId));
  }, [db, assetId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const saveName = async () => {
    try {
      if (!newName.trim()) return;
      await renameAsset(db, assetId, newName);
      setRenaming(false);
      load();
    } catch (e) {
      Alert.alert('Could not rename', String(e instanceof Error ? e.message : e));
    }
  };

  const remove = () => {
    Alert.alert('Delete asset?', `“${asset?.name}” and all of its ${entries.length} entries will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteAsset(db, assetId);
          router.back();
        },
      },
    ]);
  };

  // entries are newest first; change is relative to the next-older entry
  const latest = entries[0];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: asset?.name ?? 'Asset' }} />
      <FlatList
        data={entries}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Card>
              {renaming ? (
                <View style={{ gap: 8 }}>
                  <Input value={newName} onChangeText={setNewName} autoFocus autoCapitalize="words" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Button title="Cancel" variant="secondary" onPress={() => setRenaming(false)} style={{ flex: 1 }} />
                    <Button title="Save" onPress={saveName} style={{ flex: 1 }} />
                  </View>
                </View>
              ) : (
                <>
                  <Text style={styles.muted}>Latest value</Text>
                  <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>
                    {formatValue(latest?.value)}
                  </Text>
                  {latest && <Text style={styles.muted}>As of {formatDisplayDate(latest.date)}</Text>}
                </>
              )}
            </Card>
            <Button
              title="+ Add entry"
              onPress={() => router.push({ pathname: '/entry', params: { assetName: asset?.name ?? '' } })}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button
                title="Rename"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => {
                  setNewName(asset?.name ?? '');
                  setRenaming(true);
                }}
              />
              <Button title="Delete asset" variant="danger" style={{ flex: 1 }} onPress={remove} />
            </View>
            <Text style={[styles.title, { marginTop: 8 }]}>History</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState title="No entries" message="Add an entry to record this asset’s value." />}
        renderItem={({ item, index }) => {
          const older = entries[index + 1];
          const change = older ? Math.round((item.value - older.value) * 100) / 100 : null;
          return (
            <Pressable onPress={() => router.push({ pathname: '/entry', params: { entryId: String(item.id) } })}>
              {({ pressed }) => (
                <Card style={{ opacity: pressed ? 0.7 : 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={styles.text}>{formatDisplayDate(item.date)}</Text>
                    <Text style={[styles.text, { fontWeight: '600' }]}>{formatValue(item.value)}</Text>
                  </View>
                  {change !== null && (
                    <Text style={{ fontSize: 13, color: changeColor(change), textAlign: 'right' }}>
                      {formatChange(change)}
                    </Text>
                  )}
                  {item.note ? <Text style={styles.muted}>{item.note}</Text> : null}
                </Card>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
