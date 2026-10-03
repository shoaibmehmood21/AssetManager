# Asset Manager

An offline-first mobile app for Android and iPhone that tracks the value of your assets over time. Built with Expo (React Native + TypeScript).

- **Works without internet.** All data lives in a SQLite database on the device.
- **Add entries.** Each entry has an asset, date, value and note. A new asset is created automatically the first time you use its name.
- **Report.** A table with assets as rows and dates as columns, for any date range you choose.
- **Optional Google Sheets backup.** Back up whenever you want. On a new phone, sign in with the same Google account and restore.

## Screens

| Tab | What it does |
| --- | --- |
| **Assets** | Every asset with its latest value and the total. Tap an asset to see its history, add an entry, edit or delete entries, or rename or delete the asset. |
| **Report** | Pick a **From** and **To** date (or a quick range) and how the **date columns** are built: *Entry dates*, *Daily*, *Weekly*, *Monthly*, *Quarterly* or *Yearly*. The table shows one row per asset, one column per date, a **Change** column and a **Total** row. Scroll sideways to see more dates. *Share as CSV* exports the table. |
| **Backup** | Sign in with Google, **Back up to Google Sheets**, **Restore from Google Sheets**, and open the backup spreadsheet. |

### How report columns work

- With a periodic interval (for example *Monthly*), each column is the end of a period, and the last column is clipped to the **To** date. For example, 15 Jan to 10 Mar gives the columns 31 Jan, 28 Feb and 10 Mar.
- *Entry dates* makes one column for every date in the range that has at least one entry.
- **Carry values forward** (on by default): each cell shows the asset's latest value on or before the column date, so you see a point-in-time valuation. Turn it off to show only values recorded within each column's period.

## Running the app

```bash
npm install
npm test            # unit tests for the report, dates and backup logic
npm run typecheck
```

Google Sign-In uses native code, so the app runs in a **development build**, not in Expo Go:

```bash
# Build a development client in the cloud (no Xcode or Android Studio needed)
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start --dev-client

# Or build locally if you have Android Studio or Xcode
npx expo run:android
npx expo run:ios
```

To get an installable Android APK to share: `npx eas-cli@latest build --profile preview --platform android`.
For the stores: `npx eas-cli@latest build --profile production` and then `eas submit`.

Everything except Google backup works without any further setup.

## Google Sheets backup setup

You need this once, so the app is allowed to create a spreadsheet in the user's Google Drive.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project (or pick an existing one).
2. **APIs & Services → Library**: enable the **Google Sheets API** and the **Google Drive API**.
3. **APIs & Services → OAuth consent screen**: configure it and add the scope `https://www.googleapis.com/auth/drive.file`. While the app is in *Testing* mode, add your Google account as a test user.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**. Create these clients:
   - **Web application.** Its client ID is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. Android needs it.
   - **Android.** Package name `com.assetmanager.app` (or your `APP_BUNDLE_ID`), plus the SHA-1 of your signing key. For EAS builds, run `npx eas-cli@latest credentials` to see the SHA-1. Add one Android client for each signing key: debug, EAS and Play Store.
   - **iOS.** Bundle ID `com.assetmanager.app` (or your `APP_BUNDLE_ID`). Its client ID is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
5. Provide the IDs:
   - For local builds, copy `.env.example` to `.env.local` and fill it in.
   - For EAS cloud builds, `.env.local` is not uploaded. Add the same variables with `npx eas-cli@latest env:create` (or in the EAS dashboard) for each build environment.
6. Rebuild the app. The iOS URL scheme is generated from the iOS client ID in `app.config.ts`.

### What the backup contains

The app creates a spreadsheet called **Asset Manager Backup** in the user's Google Drive with three sheets:

- `Assets`: asset name, created at
- `Entries`: asset, date (`YYYY-MM-DD`), value, note, created at
- `Info`: format version, export time, counts

Each backup overwrites the same spreadsheet. **Restore** replaces all data on the device with the spreadsheet's contents, and asks you to confirm first. You can edit the spreadsheet by hand. Rows with an invalid date or value are skipped, and the restore tells you how many.

The app only requests the `drive.file` scope, so it can see only the files it created, not the rest of your Drive.

## Project layout

```
app.config.ts             Expo config (bundle ID, plugins, Google URL scheme)
src/app/                  Screens (Expo Router)
  (tabs)/index.tsx        Assets list
  (tabs)/report.tsx       Report table
  (tabs)/backup.tsx       Google Sheets backup and restore
  asset/[id].tsx          Asset history
  entry.tsx               Add or edit entry (modal)
src/db/database.ts        SQLite schema, migrations and queries
src/google/googleSheets.ts  Google Sign-In and the Sheets/Drive REST calls
src/lib/report.ts         Report column and grid logic (pure, unit tested)
src/lib/backup.ts         Sheet layout and parsing (pure, unit tested)
src/lib/dates.ts          Date helpers (ISO YYYY-MM-DD strings)
tests/                    node:test unit tests
```
