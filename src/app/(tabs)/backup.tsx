import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text } from 'react-native';

import { Button, Card, styles } from '../../components/ui.tsx';
import { exportAll, getMeta, replaceAll, setMeta } from '../../db/database.ts';
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
} from '../../google/googleSheets.ts';

const META_SPREADSHEET_ID = 'backup.spreadsheetId';
const META_SPREADSHEET_URL = 'backup.spreadsheetUrl';
const META_LAST_BACKUP = 'backup.lastBackupAt';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function BackupScreen() {
  const db = useSQLiteContext();
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [busy, setBusy] = useState<'signin' | 'backup' | 'restore' | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    getSignedInUser().then(setUser);
  }, []);

  useFocusEffect(
    useCallback(() => {
      getMeta(db, META_LAST_BACKUP).then(setLastBackup);
      getMeta(db, META_SPREADSHEET_URL).then(setSheetUrl);
    }, [db]),
  );

  const run = async (kind: 'signin' | 'backup' | 'restore', task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } catch (e) {
      if (!(e instanceof SignInCancelledError)) Alert.alert('Something went wrong', errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handleSignIn = () => run('signin', async () => setUser(await signIn()));

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  const handleBackup = () =>
    run('backup', async () => {
      if (!user) setUser(await signIn());
      const data = await exportAll(db);
      const sheet = await backupToSheets(data, await getMeta(db, META_SPREADSHEET_ID));
      const now = new Date().toISOString();
      await setMeta(db, META_SPREADSHEET_ID, sheet.id);
      await setMeta(db, META_SPREADSHEET_URL, sheet.url);
      await setMeta(db, META_LAST_BACKUP, now);
      setSheetUrl(sheet.url);
      setLastBackup(now);
      Alert.alert(
        'Backup complete',
        `Saved ${data.assets.length} assets and ${data.entries.length} entries to “${BACKUP_SPREADSHEET_TITLE}” in your Google Drive.`,
      );
    });

  const handleRestore = () =>
    run('restore', async () => {
      if (!user) setUser(await signIn());
      const knownId = await getMeta(db, META_SPREADSHEET_ID);
      const sheet = knownId ? { id: knownId, url: sheetUrl ?? '' } : await findBackupSpreadsheet();
      if (!sheet) {
        Alert.alert('No backup found', `There is no “${BACKUP_SPREADSHEET_TITLE}” spreadsheet in this Google account.`);
        return;
      }
      let result;
      try {
        result = await readBackup(sheet.id);
      } catch (e) {
        // The remembered sheet may have been deleted — fall back to searching Drive.
        if (!knownId) throw e;
        const found = await findBackupSpreadsheet();
        if (!found) throw e;
        Object.assign(sheet, found);
        result = await readBackup(found.id);
      }
      const { data, skippedRows } = result;
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Replace data on this device?',
          `The backup has ${data.assets.length} assets and ${data.entries.length} entries.` +
            (skippedRows ? ` ${skippedRows} invalid row(s) will be skipped.` : '') +
            '\n\nAll assets and entries currently on this device will be replaced.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Replace', style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        ),
      );
      if (!confirmed) return;
      await replaceAll(db, data);
      await setMeta(db, META_SPREADSHEET_ID, sheet.id);
      if (sheet.url) {
        await setMeta(db, META_SPREADSHEET_URL, sheet.url);
        setSheetUrl(sheet.url);
      }
      Alert.alert('Restore complete', `Imported ${data.assets.length} assets and ${data.entries.length} entries.`);
    });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.title}>Works offline</Text>
        <Text style={styles.muted}>
          Your assets are stored only on this device. Back up to Google Sheets whenever you like, and restore from it
          on a new phone by signing in with the same Google account.
        </Text>
      </Card>

      <Card>
        <Text style={styles.title}>Google account</Text>
        {user ? (
          <>
            <Text style={styles.text}>{user.name ? `${user.name} (${user.email})` : user.email}</Text>
            <Button title="Sign out" variant="secondary" onPress={handleSignOut} disabled={busy !== null} />
          </>
        ) : (
          <>
            <Text style={styles.muted}>Not signed in.</Text>
            <Button title="Sign in with Google" onPress={handleSignIn} loading={busy === 'signin'} disabled={busy !== null} />
          </>
        )}
      </Card>

      <Card>
        <Text style={styles.title}>Backup</Text>
        <Text style={styles.muted}>
          {lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleString()}` : 'No backup made from this device yet.'}
        </Text>
        <Button title="Back up to Google Sheets" onPress={handleBackup} loading={busy === 'backup'} disabled={busy !== null} />
        {sheetUrl && (
          <Button title="Open backup spreadsheet" variant="secondary" onPress={() => Linking.openURL(sheetUrl)} />
        )}
      </Card>

      <Card>
        <Text style={styles.title}>Restore</Text>
        <Text style={styles.muted}>
          Import assets and entries from your “{BACKUP_SPREADSHEET_TITLE}” spreadsheet. Use this after switching devices.
        </Text>
        <Button
          title="Restore from Google Sheets"
          variant="secondary"
          onPress={handleRestore}
          loading={busy === 'restore'}
          disabled={busy !== null}
        />
      </Card>
    </ScrollView>
  );
}
