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
| **Backup** | **Connect Google account**, then **Back up now** or **Restore from Google**. A new phone with no data offers to restore as soon as you connect. |

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

**End users don't set anything up.** They open the **Backup** tab, tap **Connect Google account** and pick an account. If the phone has no data and a backup exists, for example on a new phone, the app offers to restore it right away.

Google requires every app that uses its APIs to be registered once by the app's owner. Do this one time. The IDs you get are not secrets: they go in `google.config.json` and ship inside every build.

1. In the [Google Cloud Console](https://console.cloud.google.com/), create a project.
2. **APIs & Services → Library**: enable the **Google Sheets API** and the **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - Choose **External** and fill in the app name and support email.
   - Under **Data access**, add the scope `https://www.googleapis.com/auth/drive.file`. It's a non-sensitive scope, so Google verification isn't needed.
   - Under **Audience**, either add testers' Google accounts as test users, or click **Publish app** so any Google account can connect.
4. **Clients → Create client**:
   - **Web application** (name it anything). Copy its client ID into `webClientId` in `google.config.json`. Android needs this one.
   - **Android**: package name `com.assetmanager.app`, plus the SHA-1 of every key that signs the app:
     - The APK built by GitHub Actions and `npx expo run:android`: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`
     - EAS builds: run `npx eas-cli@latest credentials` to see the SHA-1.
     - Google Play: copy the *App signing key* SHA-1 from Play Console → App integrity.
   - **iOS**: bundle ID `com.assetmanager.app`. Copy its client ID into `iosClientId` in `google.config.json`.
5. Commit `google.config.json` and rebuild the app.

If **Connect Google account** shows *DEVELOPER_ERROR*, the APK's signing SHA-1 or package name doesn't match an Android client from step 4.

Until `google.config.json` is filled in, the Backup tab says Google backup isn't available, and the rest of the app works normally.

To get a test APK, push to the repository: the **Build Android APK** GitHub Action builds one and attaches it to the run as `asset-manager-apk`.

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
google.config.json        Google OAuth client IDs (public, shipped in the app)
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
