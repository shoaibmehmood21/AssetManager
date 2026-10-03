import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../components/ui.tsx';
import { DATABASE_NAME, migrateDatabase } from '../db/database.ts';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDatabase}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerTintColor: colors.primary,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="asset/[id]" options={{ title: 'Asset' }} />
        <Stack.Screen name="entry" options={{ presentation: 'modal', title: 'Entry' }} />
      </Stack>
    </SQLiteProvider>
  );
}
