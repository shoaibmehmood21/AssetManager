import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from 'react-native';

import { Button, Card, colors, styles } from '../../components/ui.tsx';
import { isGoogleConfigured } from '../../config/google.ts';
import { countAssets, exportAll, getMeta, replaceAll, setMeta } from '../../db/database.ts';
import {
  BACKUP_SPREADSHEET_TITLE,
  SignInCancelledError,
  backupToSheets,
  findBackupSpreadsheet,
  getSignedInUser,
  readBackup,
  signIn,
  signOut,
  type GoogleUser,
  type SpreadsheetInfo,
} from '../../google/googleSheets.ts';

const META_SPREADSHEET_ID = 'backup.spreadsheetId';
const META_LAST_BACKUP = 'backup.lastBackupAt';

type Busy = 'checking' | 'connect' | 'backup' | 'restore' | null;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatTime(iso: string | undefined | null): string {
  return iso ? new Date(iso).toLocaleString() : 'unknown';
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [busy, setBusy] = useState<Busy>(isGoogleConfigured ? 'checking' : null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  // undefined = not looked up yet, null = looked up and none exists
  const [remote, setRemote] = useState<SpreadsheetInfo | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      getMeta(db, META_LAST_BACKUP).then(setLastBackup);
    }, [db]),
  );

  const lookUpBackup = useCallback(async () => {
    const found = await findBackupSpreadsheet();
    setRemote(found);
    return found;
  }, []);

  const restoreFrom = useCallback(
    async (sheet: SpreadsheetInfo, askFirst: boolean) => {
      const { data, skippedRows } = await readBackup(sheet.id);
      const localCount = await countAssets(db);
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          askFirst ? 'Backup found' : 'Restore backup?',
          `Your Google backup from ${formatTime(sheet.modifiedTime)} has ${data.assets.length} assets and ` +
            `${data.entries.length} entries.` +
            (skippedRows ? ` ${skippedRows} invalid row(s) will be skipped.` : '') +
            (localCount > 0 ? '\n\nThe data currently on this phone will be replaced.' : '\n\nRestore it to this phone?'),
          [
            { text: askFirst ? 'Not now' : 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Restore', style: localCount > 0 ? 'destructive' : 'default', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        ),
      );
      if (!confirmed) return;
      await replaceAll(db, data);
      await setMeta(db, META_SPREADSHEET_ID, sheet.id);
      Alert.alert('Restore complete', `Imported ${data.assets.length} assets and ${data.entries.length} entries.`);
    },
    [db],
  );

  const run = useCallback(async (kind: Exclude<Busy, null>, task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      if (!(e instanceof SignInCancelledError)) Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, []);

  // Reconnect silently if the user connected before. `busy` starts as 'checking'.
  useEffect(() => {
    if (!isGoogleConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const u = await getSignedInUser();
        if (cancelled) return;
        setUser(u);
        if (u) await lookUpBackup();
      } catch {
        // Offline or Google unreachable — the user can still connect manually.
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lookUpBackup]);

  const connect = () =>
    run('connect', async () => {
      const u = await signIn();
      setUser(u);
      const found = await lookUpBackup();
      // New phone or fresh install: offer to bring the data back right away.
      if (found && (await countAssets(db)) === 0) await restoreFrom(found, true);
    });

  const disconnect = () =>
    Alert.alert('Disconnect Google account?', 'Your backup stays in Google Drive. You can reconnect any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setUser(null);
          setRemote(undefined);
        },
      },
    ]);

  const backup = () =>
    run('backup', async () => {
      const data = await exportAll(db);
      const sheet = await backupToSheets(data, remote?.id ?? (await getMeta(db, META_SPREADSHEET_ID)));
      const now = new Date().toISOString();
      await setMeta(db, META_SPREADSHEET_ID, sheet.id);
      await setMeta(db, META_LAST_BACKUP, now);
      setRemote(sheet);
      setLastBackup(now);
      Alert.alert('Backup complete', `Saved ${data.assets.length} assets and ${data.entries.length} entries to Google Sheets.`);
    });

  const restore = () =>
    run('restore', async () => {
      const found = await lookUpBackup();
      if (!found) {
        Alert.alert('No backup found', `There is no “${BACKUP_SPREADSHEET_TITLE}” in ${user?.email ?? 'this account'}.`);
        return;
      }
      await restoreFrom(found, false);
    });

  const connected = user !== null;
  const working = busy !== null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="phone-portrait-outline" size={22} color={colors.primary} />
          <Text style={styles.title}>Your data stays on this phone</Text>
        </View>
        <Text style={styles.muted}>
          The app works fully offline. Connect a Google account only if you want a backup in Google Sheets — for
          example to move your data to a new phone.
        </Text>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="logo-google" size={20} color={connected ? colors.positive : colors.muted} />
          <Text style={styles.title}>Google account</Text>
        </View>
        {!isGoogleConfigured ? (
          <Text style={styles.muted}>Google backup is not available in this version of the app.</Text>
        ) : busy === 'checking' ? (
          <ActivityIndicator style={{ alignSelf: 'flex-start' }} />
        ) : connected ? (
          <>
            <Text style={styles.text}>Connected as {user.email}</Text>
            <Button title="Disconnect" variant="secondary" onPress={disconnect} disabled={working} />
          </>
        ) : (
          <>
            <Text style={styles.muted}>
              Connect to back up and restore. The app can only see the backup spreadsheet it creates — not the rest of
              your Google Drive.
            </Text>
            <Button title="Connect Google account" onPress={connect} loading={busy === 'connect'} disabled={working} />
          </>
        )}
      </Card>

      {connected && (
        <>
          <Card>
            <Text style={styles.title}>Backup</Text>
            <Text style={styles.muted}>
              {remote === undefined
                ? 'Looking for an existing backup…'
                : remote
                  ? `Backup in Google Drive, last updated ${formatTime(remote.modifiedTime)}.`
                  : 'No backup in this Google account yet.'}
              {lastBackup ? `\nLast backup from this phone: ${formatTime(lastBackup)}.` : ''}
            </Text>
            <Button title="Back up now" onPress={backup} loading={busy === 'backup'} disabled={working} />
            {remote && (
              <Button title="Open backup in Google Sheets" variant="secondary" onPress={() => Linking.openURL(remote.url)} />
            )}
          </Card>

          <Card>
            <Text style={styles.title}>Restore</Text>
            <Text style={styles.muted}>
              Replace the data on this phone with your Google backup. Use this after switching phones.
            </Text>
            <Button
              title="Restore from Google"
              variant="secondary"
              onPress={restore}
              loading={busy === 'restore'}
              disabled={working || remote === null}
            />
          </Card>
        </>
      )}
    </ScrollView>
  );
}
