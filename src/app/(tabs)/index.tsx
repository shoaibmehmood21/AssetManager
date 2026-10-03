import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Button, Card, EmptyState, colors, formatValue, styles } from '../../components/ui.tsx';
import { listAssetSummaries, type AssetSummary } from '../../db/database.ts';
import { formatDisplayDate } from '../../lib/dates.ts';

export default function AssetsScreen() {
  const db = useSQLiteContext();
  const [assets, setAssets] = useState<AssetSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listAssetSummaries(db).then(setAssets);
    }, [db]),
  );

  const total = assets.reduce((sum, a) => sum + (a.latestValue ?? 0), 0);

  return (
    <View style={styles.screen}>
      <FlatList
        data={assets}
        keyExtractor={(a) => String(a.id)}
        contentContainerStyle={[styles.content, { paddingBottom: 96 }]}
        ListHeaderComponent={
          assets.length > 0 ? (
            <Card>
              <Text style={styles.muted}>Total (latest values)</Text>
              <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{formatValue(total)}</Text>
              <Text style={styles.muted}>
                {assets.length} asset{assets.length === 1 ? '' : 's'}
              </Text>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="No assets yet"
            message="Tap “Add entry” to record an asset with its date, value and a note. Everything is stored on this device."
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/asset/[id]', params: { id: String(item.id) } })}>
            {({ pressed }) => (
              <Card style={{ opacity: pressed ? 0.7 : 1, flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.title}>{item.name}</Text>
                  <Text style={styles.muted}>
                    {item.latestDate ? `As of ${formatDisplayDate(item.latestDate)}` : 'No entries'} ·{' '}
                    {item.entryCount} entr{item.entryCount === 1 ? 'y' : 'ies'}
                  </Text>
                </View>
                <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
                  {formatValue(item.latestValue)}
                </Text>
              </Card>
            )}
          </Pressable>
        )}
      />
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <Button title="+ Add entry" onPress={() => router.push('/entry')} />
      </View>
    </View>
  );
}
