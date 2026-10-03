/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseSheetValues, toSheetValues } from '../src/lib/backup.ts';

test('round-trips data through sheet values', () => {
  const data = {
    assets: [{ name: 'House', createdAt: '2026-01-01T00:00:00.000Z' }],
    entries: [{ assetName: 'House', date: '2026-02-01', value: 1500.5, note: 'valuation', createdAt: 'x' }],
  };
  const values = toSheetValues(data, 'now');
  const parsed = parseSheetValues(values.Assets, values.Entries);
  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.skippedRows, 0);
});

test('tolerates hand-edited sheets', () => {
  const parsed = parseSheetValues(
    [['Asset', 'Created At'], ['house', ''], ['', '']],
    [
      ['Asset', 'Date', 'Value', 'Note', 'Created At'],
      ['House', 46023, '1,200', '', ''], // serial date, formatted number
      ['Car', '2026-13-01', 5, '', ''], // invalid date
      ['Boat', '2026-01-01', 'abc', '', ''], // invalid value
      ['Bike', '2026-01-02', 50], // new asset, short row
      [],
    ],
  );
  assert.equal(parsed.skippedRows, 2);
  assert.deepEqual(parsed.data.assets.map((a) => a.name), ['house', 'Bike']);
  assert.deepEqual(
    parsed.data.entries.map((e) => [e.assetName, e.date, e.value]),
    [
      ['house', '2026-01-01', 1200],
      ['Bike', '2026-01-02', 50],
    ],
  );
});
