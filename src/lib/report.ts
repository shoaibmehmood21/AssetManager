import {
  addDays,
  addMonths,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  endOfYear,
  formatDisplayDate,
  monthLabel,
  quarterLabel,
} from './dates.ts';

export type ReportInterval = 'entries' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const INTERVAL_LABELS: Record<ReportInterval, string> = {
  entries: 'Entry dates',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

/** Hard cap so a wide range with a daily interval can't freeze the UI. */
export const MAX_COLUMNS = 370;

export interface ReportColumn {
  /** The "as of" date for this column (inclusive). */
  date: string;
  label: string;
}

export interface ReportAsset {
  id: number;
  name: string;
}

export interface ReportEntry {
  id: number;
  assetId: number;
  date: string;
  value: number;
}

export interface ReportRow {
  assetId: number;
  name: string;
  values: (number | null)[];
  /** Last non-empty value minus first non-empty value across the columns. */
  change: number | null;
}

export interface Report {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals: (number | null)[];
  totalChange: number | null;
  truncated: boolean;
}

/**
 * Build the date columns for the report between `from` and `to` (inclusive).
 *
 * For periodic intervals each column is the end of a period, clipped to the
 * range, so the last column is always `to`. For "entries" every distinct date
 * that has at least one entry in the range becomes a column.
 */
export function buildColumns(
  from: string,
  to: string,
  interval: ReportInterval,
  entryDates: string[] = [],
): { columns: ReportColumn[]; truncated: boolean } {
  if (from > to) return { columns: [], truncated: false };

  const columns: ReportColumn[] = [];

  if (interval === 'entries') {
    const dates = Array.from(new Set(entryDates.filter((d) => d >= from && d <= to))).sort();
    for (const date of dates) columns.push({ date, label: formatDisplayDate(date) });
  } else {
    let cursor = from;
    while (cursor <= to) {
      let periodEnd: string;
      let label: string;
      switch (interval) {
        case 'daily':
          periodEnd = cursor;
          break;
        case 'weekly':
          periodEnd = endOfWeek(cursor);
          break;
        case 'monthly':
          periodEnd = endOfMonth(cursor);
          break;
        case 'quarterly':
          periodEnd = endOfQuarter(cursor);
          break;
        case 'yearly':
          periodEnd = endOfYear(cursor);
          break;
      }
      const date = periodEnd > to ? to : periodEnd;
      switch (interval) {
        case 'monthly':
          label = monthLabel(date);
          break;
        case 'quarterly':
          label = quarterLabel(date);
          break;
        case 'yearly':
          label = date.slice(0, 4);
          break;
        default:
          label = formatDisplayDate(date);
      }
      columns.push({ date, label });
      if (columns.length > MAX_COLUMNS) break;
      cursor = addDays(periodEnd, 1);
    }
  }

  const truncated = columns.length > MAX_COLUMNS;
  return { columns: truncated ? columns.slice(0, MAX_COLUMNS) : columns, truncated };
}

/**
 * Fill the report grid.
 *
 * carryForward = true: each cell shows the asset's most recent value on or
 * before the column date (a point-in-time valuation).
 * carryForward = false: a cell only has a value if an entry was recorded in
 * that column's period (after the previous column, up to this column's date).
 */
export function buildReport(
  assets: ReportAsset[],
  entries: ReportEntry[],
  columns: ReportColumn[],
  carryForward: boolean,
  truncated = false,
): Report {
  const byAsset = new Map<number, ReportEntry[]>();
  for (const e of entries) {
    const list = byAsset.get(e.assetId);
    if (list) list.push(e);
    else byAsset.set(e.assetId, [e]);
  }
  // Oldest first; for the same date the later-recorded entry wins.
  for (const list of byAsset.values()) {
    list.sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  }

  const rows: ReportRow[] = [];
  for (const asset of assets) {
    const list = byAsset.get(asset.id) ?? [];
    const values: (number | null)[] = [];
    let i = 0;
    let latest: ReportEntry | null = null;
    let prevColDate: string | null = null;
    for (const col of columns) {
      while (i < list.length && list[i].date <= col.date) {
        latest = list[i];
        i++;
      }
      if (!latest) values.push(null);
      else if (carryForward) values.push(latest.value);
      else values.push(prevColDate === null || latest.date > prevColDate ? latest.value : null);
      prevColDate = col.date;
    }
    if (values.every((v) => v === null)) continue;
    rows.push({ assetId: asset.id, name: asset.name, values, change: changeOf(values) });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));

  const totals = columns.map((_, c) => {
    let sum: number | null = null;
    for (const r of rows) {
      const v = r.values[c];
      if (v !== null) sum = (sum ?? 0) + v;
    }
    return sum;
  });

  return { columns, rows, totals, totalChange: changeOf(totals), truncated };
}

function changeOf(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;
  return round2(present[present.length - 1] - present[0]);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reportToCSV(report: Report): string {
  const lines: string[] = [];
  lines.push(['Asset', ...report.columns.map((c) => c.date), 'Change'].map(csvCell).join(','));
  const fmt = (v: number | null) => (v === null ? '' : String(v));
  for (const r of report.rows) {
    lines.push([csvCell(r.name), ...r.values.map(fmt), fmt(r.change)].join(','));
  }
  lines.push(['Total', ...report.totals.map((v) => fmt(v === null ? null : round2(v))), fmt(report.totalChange)].join(','));
  return lines.join('\n');
}

/** Sensible default range: the last 12 months ending today. */
export function defaultRange(today: string): { from: string; to: string } {
  return { from: addDays(addMonths(today, -12), 1), to: today };
}
