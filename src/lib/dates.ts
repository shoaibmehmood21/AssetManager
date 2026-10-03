// Dates are stored everywhere as ISO calendar strings (YYYY-MM-DD). All
// arithmetic is done in UTC so daylight-saving changes never shift a day.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isValidISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parse an ISO date string into a UTC-midnight Date. */
export function parseISODate(value: string): Date {
  const m = ISO_RE.exec(value);
  if (!m) throw new Error(`Invalid date: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Format a UTC-midnight Date as an ISO date string. */
export function formatISODate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Convert a Date picked in the device's local time zone to an ISO date string. */
export function localDateToISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Convert an ISO date string to a Date at local midnight (for date pickers). */
export function isoToLocalDate(value: string): Date {
  const d = parseISODate(value);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function todayISO(): string {
  return localDateToISO(new Date());
}

export function addDays(value: string, days: number): string {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return formatISODate(d);
}

/** Add months, clamping to the last day of the target month. */
export function addMonths(value: string, months: number): string {
  const d = parseISODate(value);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatISODate(target);
}

export function endOfMonth(value: string): string {
  const d = parseISODate(value);
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function endOfQuarter(value: string): string {
  const d = parseISODate(value);
  const qEndMonth = Math.floor(d.getUTCMonth() / 3) * 3 + 3;
  return formatISODate(new Date(Date.UTC(d.getUTCFullYear(), qEndMonth, 0)));
}

export function endOfYear(value: string): string {
  return `${value.slice(0, 4)}-12-31`;
}

/** Sunday-ending weeks (Mon–Sun). */
export function endOfWeek(value: string): string {
  const d = parseISODate(value);
  const dow = d.getUTCDay(); // 0 = Sunday
  return addDays(value, dow === 0 ? 0 : 7 - dow);
}

/** e.g. "3 Oct 2026" */
export function formatDisplayDate(value: string): string {
  if (!isValidISODate(value)) return value;
  const d = parseISODate(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function monthLabel(value: string): string {
  const d = parseISODate(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function quarterLabel(value: string): string {
  const d = parseISODate(value);
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

/**
 * Google Sheets returns dates the user typed into a cell as serial numbers
 * (days since 1899-12-30). Convert one back to an ISO date string.
 */
export function sheetSerialToISO(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  return formatISODate(new Date(ms));
}
