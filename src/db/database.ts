import type { SQLiteDatabase } from 'expo-sqlite';

import type { BackupData } from '../lib/backup.ts';

export const DATABASE_NAME = 'assets.db';

const SCHEMA_VERSION = 1;

/** Runs once when the SQLiteProvider opens the database. */
export async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        value REAL NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_entries_asset_date ON entries(asset_id, date);
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

export interface Asset {
  id: number;
  name: string;
  createdAt: string;
}

export interface Entry {
  id: number;
  assetId: number;
  date: string;
  value: number;
  note: string;
  createdAt: string;
}

export interface AssetSummary extends Asset {
  latestValue: number | null;
  latestDate: string | null;
  entryCount: number;
}

export interface EntryInput {
  assetName: string;
  date: string;
  value: number;
  note: string;
}

type EntryRow = { id: number; asset_id: number; date: string; value: number; note: string; created_at: string };

function mapEntry(r: EntryRow): Entry {
  return { id: r.id, assetId: r.asset_id, date: r.date, value: r.value, note: r.note, createdAt: r.created_at };
}

export async function listAssetSummaries(db: SQLiteDatabase): Promise<AssetSummary[]> {
  // The latest entry per asset is the one with the greatest date, ties broken
  // by the most recently inserted row.
  const rows = await db.getAllAsync<{
    id: number;
    name: string;
    created_at: string;
    entry_count: number;
    latest_value: number | null;
    latest_date: string | null;
  }>(`
    SELECT a.id, a.name, a.created_at,
      (SELECT COUNT(*) FROM entries e WHERE e.asset_id = a.id) AS entry_count,
      (SELECT e.value FROM entries e WHERE e.asset_id = a.id ORDER BY e.date DESC, e.id DESC LIMIT 1) AS latest_value,
      (SELECT e.date FROM entries e WHERE e.asset_id = a.id ORDER BY e.date DESC, e.id DESC LIMIT 1) AS latest_date
    FROM assets a
    ORDER BY a.name COLLATE NOCASE
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    entryCount: r.entry_count,
    latestValue: r.latest_value,
    latestDate: r.latest_date,
  }));
}

export async function listAssets(db: SQLiteDatabase): Promise<Asset[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; created_at: string }>(
    'SELECT id, name, created_at FROM assets ORDER BY name COLLATE NOCASE',
  );
  return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
}

export async function getAsset(db: SQLiteDatabase, id: number): Promise<Asset | null> {
  const r = await db.getFirstAsync<{ id: number; name: string; created_at: string }>(
    'SELECT id, name, created_at FROM assets WHERE id = ?',
    id,
  );
  return r ? { id: r.id, name: r.name, createdAt: r.created_at } : null;
}

export async function listEntriesForAsset(db: SQLiteDatabase, assetId: number): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>(
    'SELECT * FROM entries WHERE asset_id = ? ORDER BY date DESC, id DESC',
    assetId,
  );
  return rows.map(mapEntry);
}

/** All entries on or before `to` — earlier entries are needed to carry values forward. */
export async function listEntriesUpTo(db: SQLiteDatabase, to: string): Promise<Entry[]> {
  const rows = await db.getAllAsync<EntryRow>('SELECT * FROM entries WHERE date <= ?', to);
  return rows.map(mapEntry);
}

export async function getEntry(db: SQLiteDatabase, id: number): Promise<(Entry & { assetName: string }) | null> {
  const r = await db.getFirstAsync<EntryRow & { asset_name: string }>(
    'SELECT e.*, a.name AS asset_name FROM entries e JOIN assets a ON a.id = e.asset_id WHERE e.id = ?',
    id,
  );
  return r ? { ...mapEntry(r), assetName: r.asset_name } : null;
}

/** Find an asset by name (case-insensitive) or create it. */
async function ensureAsset(db: SQLiteDatabase, name: string): Promise<number> {
  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM assets WHERE name = ?', name);
  if (existing) return existing.id;
  const res = await db.runAsync(
    'INSERT INTO assets (name, created_at) VALUES (?, ?)',
    name,
    new Date().toISOString(),
  );
  return res.lastInsertRowId;
}

export async function addEntry(db: SQLiteDatabase, input: EntryInput): Promise<number> {
  const assetId = await ensureAsset(db, input.assetName.trim());
  const res = await db.runAsync(
    'INSERT INTO entries (asset_id, date, value, note, created_at) VALUES (?, ?, ?, ?, ?)',
    assetId,
    input.date,
    input.value,
    input.note.trim(),
    new Date().toISOString(),
  );
  return res.lastInsertRowId;
}

export async function updateEntry(db: SQLiteDatabase, id: number, input: EntryInput): Promise<void> {
  const assetId = await ensureAsset(db, input.assetName.trim());
  await db.runAsync(
    'UPDATE entries SET asset_id = ?, date = ?, value = ?, note = ? WHERE id = ?',
    assetId,
    input.date,
    input.value,
    input.note.trim(),
    id,
  );
}

export async function deleteEntry(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM entries WHERE id = ?', id);
}

/** Throws if another asset already has the name. */
export async function renameAsset(db: SQLiteDatabase, id: number, name: string): Promise<void> {
  const clash = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM assets WHERE name = ? AND id <> ?',
    name.trim(),
    id,
  );
  if (clash) throw new Error(`An asset named "${name.trim()}" already exists.`);
  await db.runAsync('UPDATE assets SET name = ? WHERE id = ?', name.trim(), id);
}

export async function deleteAsset(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM assets WHERE id = ?', id);
}

export async function exportAll(db: SQLiteDatabase): Promise<BackupData> {
  const assets = await listAssets(db);
  const rows = await db.getAllAsync<EntryRow & { asset_name: string }>(`
    SELECT e.*, a.name AS asset_name FROM entries e JOIN assets a ON a.id = e.asset_id
    ORDER BY a.name COLLATE NOCASE, e.date, e.id
  `);
  return {
    assets: assets.map((a) => ({ name: a.name, createdAt: a.createdAt })),
    entries: rows.map((r) => ({
      assetName: r.asset_name,
      date: r.date,
      value: r.value,
      note: r.note,
      createdAt: r.created_at,
    })),
  };
}

/** Replace every asset and entry with the given data in one transaction. */
export async function replaceAll(db: SQLiteDatabase, data: BackupData): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM entries; DELETE FROM assets;');
    const ids = new Map<string, number>();
    for (const a of data.assets) {
      const res = await txn.runAsync('INSERT INTO assets (name, created_at) VALUES (?, ?)', a.name, a.createdAt);
      ids.set(a.name.toLowerCase(), res.lastInsertRowId);
    }
    for (const e of data.entries) {
      const assetId = ids.get(e.assetName.toLowerCase());
      if (assetId === undefined) continue;
      await txn.runAsync(
        'INSERT INTO entries (asset_id, date, value, note, created_at) VALUES (?, ?, ?, ?, ?)',
        assetId,
        e.date,
        e.value,
        e.note,
        e.createdAt,
      );
    }
  });
}

export async function getMeta(db: SQLiteDatabase, key: string): Promise<string | null> {
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return r?.value ?? null;
}

export async function setMeta(db: SQLiteDatabase, key: string, value: string | null): Promise<void> {
  if (value === null) await db.runAsync('DELETE FROM meta WHERE key = ?', key);
  else await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
}
