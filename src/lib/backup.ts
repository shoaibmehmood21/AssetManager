import { isValidISODate, sheetSerialToISO } from './dates.ts';

// Layout of the backup spreadsheet. Entries reference assets by name (not by
// local ID) so the sheet stays readable and can be edited by hand.

export const BACKUP_FORMAT_VERSION = 1;
export const SHEET_ASSETS = 'Assets';
export const SHEET_ENTRIES = 'Entries';
export const SHEET_INFO = 'Info';
export const BACKUP_SHEETS = [SHEET_ASSETS, SHEET_ENTRIES, SHEET_INFO];

export const ASSET_HEADER = ['Asset', 'Created At'];
export const ENTRY_HEADER = ['Asset', 'Date', 'Value', 'Note', 'Created At'];

export interface BackupAsset {
  name: string;
  createdAt: string;
}

export interface BackupEntry {
  assetName: string;
  date: string;
  value: number;
  note: string;
  createdAt: string;
}

export interface BackupData {
  assets: BackupAsset[];
  entries: BackupEntry[];
}

export type CellValue = string | number | boolean;

export function toSheetValues(data: BackupData, exportedAt: string): Record<string, CellValue[][]> {
  return {
    [SHEET_ASSETS]: [ASSET_HEADER, ...data.assets.map((a) => [a.name, a.createdAt])],
    [SHEET_ENTRIES]: [
      ENTRY_HEADER,
      ...data.entries.map((e) => [e.assetName, e.date, e.value, e.note, e.createdAt]),
    ],
    [SHEET_INFO]: [
      ['Key', 'Value'],
      ['app', 'Asset Manager'],
      ['format_version', BACKUP_FORMAT_VERSION],
      ['exported_at', exportedAt],
      ['asset_count', data.assets.length],
      ['entry_count', data.entries.length],
    ],
  };
}

export interface ParseResult {
  data: BackupData;
  skippedRows: number;
}

function str(cell: unknown): string {
  return cell === undefined || cell === null ? '' : String(cell).trim();
}

function parseDateCell(cell: unknown): string | null {
  if (typeof cell === 'number' && Number.isFinite(cell)) return sheetSerialToISO(cell);
  const s = str(cell);
  return isValidISODate(s) ? s : null;
}

function parseNumberCell(cell: unknown): number | null {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  const s = str(cell).replace(/[,\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse rows read back from the backup spreadsheet (header row included). */
export function parseSheetValues(assetRows: unknown[][], entryRows: unknown[][]): ParseResult {
  let skippedRows = 0;
  const assets = new Map<string, BackupAsset>();
  const now = new Date().toISOString();

  const addAsset = (name: string, createdAt: string) => {
    const key = name.toLowerCase();
    if (!assets.has(key)) assets.set(key, { name, createdAt: createdAt || now });
  };

  for (const row of assetRows.slice(1)) {
    const name = str(row[0]);
    if (!name) {
      if (row.some((c) => str(c) !== '')) skippedRows++;
      continue;
    }
    addAsset(name, str(row[1]));
  }

  const entries: BackupEntry[] = [];
  for (const row of entryRows.slice(1)) {
    if (!row.some((c) => str(c) !== '')) continue;
    const assetName = str(row[0]);
    const date = parseDateCell(row[1]);
    const value = parseNumberCell(row[2]);
    if (!assetName || date === null || value === null) {
      skippedRows++;
      continue;
    }
    addAsset(assetName, '');
    entries.push({
      assetName: assets.get(assetName.toLowerCase())!.name,
      date,
      value,
      note: str(row[3]),
      createdAt: str(row[4]) || now,
    });
  }

  return { data: { assets: Array.from(assets.values()), entries }, skippedRows };
}
