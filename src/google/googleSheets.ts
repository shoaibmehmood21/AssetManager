import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';

import {
  BACKUP_SHEETS,
  SHEET_ASSETS,
  SHEET_ENTRIES,
  toSheetValues,
  type BackupData,
  type ParseResult,
  parseSheetValues,
} from '../lib/backup.ts';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, isGoogleConfigured } from '../config/google.ts';

// drive.file only grants access to files this app created, which is all we
// need: the app creates the backup spreadsheet and finds it again (on any
// device signed in to the same Google account).
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export const BACKUP_SPREADSHEET_TITLE = 'Asset Manager Backup';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

let configured = false;

function configure() {
  if (configured) return;
  if (!isGoogleConfigured) throw new Error('Google backup is not set up in this version of the app.');
  GoogleSignin.configure({
    scopes: SCOPES,
    ...(GOOGLE_WEB_CLIENT_ID ? { webClientId: GOOGLE_WEB_CLIENT_ID } : {}),
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
  });
  configured = true;
}

export interface GoogleUser {
  email: string;
  name: string | null;
}

export class SignInCancelledError extends Error {
  constructor() {
    super('Google sign-in was cancelled.');
  }
}

/** Returns the signed-in user without showing any UI, or null. */
export async function getSignedInUser(): Promise<GoogleUser | null> {
  if (!isGoogleConfigured) return null;
  configure();
  try {
    const res = await GoogleSignin.signInSilently();
    if (res.type === 'success') return { email: res.data.user.email, name: res.data.user.name };
  } catch {
    // Not signed in, or Google Play Services unavailable — treat as signed out.
  }
  return null;
}

export async function signIn(): Promise<GoogleUser> {
  configure();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) throw new SignInCancelledError();
    if (!res.data.scopes.includes(SCOPES[0])) {
      const granted = await GoogleSignin.addScopes({ scopes: SCOPES });
      if (!granted) throw new Error('Google Drive access is required to back up to Google Sheets.');
    }
    return { email: res.data.user.email, name: res.data.user.name };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) throw new SignInCancelledError();
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error('Google Play Services is not available on this device.');
      }
      if (e.code === statusCodes.IN_PROGRESS) throw new Error('Sign-in is already in progress.');
      // Android reports a package name / signing certificate mismatch as DEVELOPER_ERROR (code 10).
      if (String(e.code) === '10' || /DEVELOPER_ERROR/i.test(e.message)) {
        throw new Error(
          'Google rejected this copy of the app (DEVELOPER_ERROR). The app’s package name and signing ' +
            'certificate (SHA-1) must be registered as an Android OAuth client in Google Cloud.',
        );
      }
    }
    throw e;
  }
}

/** Disconnect: forget the account and revoke the app's access to it. */
export async function signOut(): Promise<void> {
  configure();
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Already revoked or offline — signing out locally is still enough.
  }
  await GoogleSignin.signOut();
}

async function ensureSignedIn(): Promise<void> {
  if (!(await getSignedInUser())) await signIn();
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Authorized fetch against Google APIs; retries once with a fresh token on 401. */
async function googleFetch<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const { accessToken } = await GoogleSignin.getTokens();
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && !retried) {
    await GoogleSignin.clearCachedAccessToken(accessToken);
    return googleFetch<T>(url, init, true);
  }
  if (!res.ok) {
    let message = `Google API request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // keep the generic message
    }
    throw new HttpError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface SpreadsheetInfo {
  id: string;
  url: string;
  /** ISO timestamp of the last change, when known. */
  modifiedTime?: string;
}

type SpreadsheetMeta = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: { properties: { title: string } }[];
};

async function getSpreadsheet(id: string): Promise<SpreadsheetMeta | null> {
  try {
    return await googleFetch<SpreadsheetMeta>(
      `${SHEETS_API}/${encodeURIComponent(id)}?fields=spreadsheetId,spreadsheetUrl,sheets.properties.title`,
    );
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Find the most recently modified backup spreadsheet this app created for the signed-in account. */
export async function findBackupSpreadsheet(): Promise<SpreadsheetInfo | null> {
  await ensureSignedIn();
  const q = [
    `name = '${BACKUP_SPREADSHEET_TITLE}'`,
    "mimeType = 'application/vnd.google-apps.spreadsheet'",
    'trashed = false',
  ].join(' and ');
  const params = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    fields: 'files(id,name,modifiedTime)',
    spaces: 'drive',
    pageSize: '10',
  });
  const res = await googleFetch<{ files: { id: string; modifiedTime?: string }[] }>(
    `${DRIVE_API}?${params.toString()}`,
  );
  for (const f of res.files ?? []) {
    const meta = await getSpreadsheet(f.id);
    if (meta) return { id: meta.spreadsheetId, url: meta.spreadsheetUrl, modifiedTime: f.modifiedTime };
  }
  return null;
}

async function createSpreadsheet(): Promise<SpreadsheetMeta> {
  return googleFetch<SpreadsheetMeta>(SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title: BACKUP_SPREADSHEET_TITLE },
      sheets: BACKUP_SHEETS.map((title) => ({ properties: { title, gridProperties: { frozenRowCount: 1 } } })),
    }),
  });
}

/**
 * Write all local data to the backup spreadsheet, creating it if needed.
 * `knownId` is the spreadsheet used for the last backup on this device.
 */
export async function backupToSheets(data: BackupData, knownId: string | null): Promise<SpreadsheetInfo> {
  await ensureSignedIn();

  let meta = knownId ? await getSpreadsheet(knownId) : null;
  if (!meta) {
    const found = await findBackupSpreadsheet();
    meta = found ? await getSpreadsheet(found.id) : null;
  }
  if (!meta) meta = await createSpreadsheet();

  const id = encodeURIComponent(meta.spreadsheetId);
  const existing = new Set(meta.sheets.map((s) => s.properties.title));
  const missing = BACKUP_SHEETS.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    await googleFetch(`${SHEETS_API}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }

  await googleFetch(`${SHEETS_API}/${id}/values:batchClear`, {
    method: 'POST',
    body: JSON.stringify({ ranges: BACKUP_SHEETS }),
  });

  const values = toSheetValues(data, new Date().toISOString());
  await googleFetch(`${SHEETS_API}/${id}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: Object.entries(values).map(([sheet, rows]) => ({ range: `'${sheet}'!A1`, values: rows })),
    }),
  });

  return { id: meta.spreadsheetId, url: meta.spreadsheetUrl, modifiedTime: new Date().toISOString() };
}

/** Read and parse the backup spreadsheet. Does not touch the local database. */
export async function readBackup(spreadsheetId: string): Promise<ParseResult> {
  await ensureSignedIn();
  const params = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  params.append('ranges', `'${SHEET_ASSETS}'`);
  params.append('ranges', `'${SHEET_ENTRIES}'`);
  const res = await googleFetch<{ valueRanges: { values?: unknown[][] }[] }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
  );
  const [assets, entries] = res.valueRanges ?? [];
  return parseSheetValues(assets?.values ?? [], entries?.values ?? []);
}
