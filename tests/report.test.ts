/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, endOfWeek, isValidISODate, sheetSerialToISO } from '../src/lib/dates.ts';
import { buildColumns, buildReport, reportToCSV, type ReportEntry } from '../src/lib/report.ts';

test('date helpers', () => {
  assert.equal(isValidISODate('2026-02-29'), false);
  assert.equal(isValidISODate('2028-02-29'), true);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-03-15', -12), '2025-03-15');
  assert.equal(endOfWeek('2026-10-01'), '2026-10-04'); // Thu -> Sun
  assert.equal(endOfWeek('2026-10-04'), '2026-10-04');
  assert.equal(sheetSerialToISO(46023), '2026-01-01');
});

test('monthly columns are period ends clipped to the range', () => {
  const { columns } = buildColumns('2026-01-15', '2026-03-10', 'monthly');
  assert.deepEqual(
    columns.map((c) => [c.date, c.label]),
    [
      ['2026-01-31', 'Jan 2026'],
      ['2026-02-28', 'Feb 2026'],
      ['2026-03-10', 'Mar 2026'],
    ],
  );
});

test('quarterly, yearly and daily columns', () => {
  assert.deepEqual(
    buildColumns('2025-11-01', '2026-04-01', 'quarterly').columns.map((c) => c.label),
    ['Q4 2025', 'Q1 2026', 'Q2 2026'],
  );
  assert.deepEqual(
    buildColumns('2024-06-01', '2026-06-01', 'yearly').columns.map((c) => c.date),
    ['2024-12-31', '2025-12-31', '2026-06-01'],
  );
  assert.equal(buildColumns('2026-01-01', '2026-01-31', 'daily').columns.length, 31);
  assert.deepEqual(buildColumns('2026-02-01', '2026-01-01', 'daily').columns, []);
});

test('entry-date columns use distinct dates within range', () => {
  const { columns } = buildColumns('2026-01-01', '2026-12-31', 'entries', [
    '2026-05-01',
    '2025-12-31',
    '2026-02-01',
    '2026-05-01',
  ]);
  assert.deepEqual(columns.map((c) => c.date), ['2026-02-01', '2026-05-01']);
});

test('daily columns over a long range are truncated', () => {
  const r = buildColumns('2020-01-01', '2026-01-01', 'daily');
  assert.equal(r.truncated, true);
  assert.equal(r.columns.length, 370);
});

const assets = [
  { id: 1, name: 'House' },
  { id: 2, name: 'Car' },
  { id: 3, name: 'Empty' },
];
const entries: ReportEntry[] = [
  { id: 1, assetId: 1, date: '2025-12-15', value: 100 },
  { id: 2, assetId: 1, date: '2026-02-10', value: 120 },
  { id: 3, assetId: 1, date: '2026-02-10', value: 125 }, // same day, later wins
  { id: 4, assetId: 2, date: '2026-02-20', value: 30 },
];

test('carry-forward report', () => {
  const { columns } = buildColumns('2026-01-01', '2026-03-31', 'monthly');
  const r = buildReport(assets, entries, columns, true);
  assert.deepEqual(r.rows.map((x) => x.name), ['Car', 'House']); // sorted, empty asset dropped
  assert.deepEqual(r.rows[1].values, [100, 125, 125]);
  assert.deepEqual(r.rows[0].values, [null, 30, 30]);
  assert.equal(r.rows[1].change, 25);
  assert.deepEqual(r.totals, [100, 155, 155]);
  assert.equal(r.totalChange, 55);
});

test('exact (no carry) report', () => {
  const { columns } = buildColumns('2026-01-01', '2026-03-31', 'monthly');
  const r = buildReport(assets, entries, columns, false);
  const house = r.rows.find((x) => x.name === 'House')!;
  // first column includes anything up to its date when there is no previous column
  assert.deepEqual(house.values, [100, 125, null]);
});

test('csv export', () => {
  const { columns } = buildColumns('2026-02-01', '2026-02-28', 'monthly');
  const csv = reportToCSV(buildReport([{ id: 1, name: 'A, "b"' }], entries.map((e) => ({ ...e, assetId: 1 })), columns, true));
  assert.equal(csv, 'Asset,2026-02-28,Change\n"A, ""b""",30,\nTotal,30,');
});
