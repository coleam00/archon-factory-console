import { expect, test } from 'bun:test';
import {
  type BackfillItem,
  backfillReport,
  mergedLine,
  selectBackfill,
} from './console-merge-backfill';

const PR = 'https://github.com/acme/web/pull/7';
const AT = '2026-11-17T01:00:00Z';
const item = (key: string, fields: Partial<BackfillItem>): BackfillItem => ({
  key,
  recorded: false,
  change: { url: PR, merged: true, mergedAt: AT },
  runChanges: [PR],
  ...fields,
});

test('prints a line only for a merge with a time whose URL a run of the item named', () => {
  expect(
    selectBackfill([
      item('1', {}),
      item('2', { runChanges: [null] }),
      item('3', { change: { url: PR, merged: true, mergedAt: null } }),
      item('4', { change: { url: null, merged: 'unknown', mergedAt: null } }),
      item('5', { change: { url: PR, merged: 'pending', mergedAt: null } }),
      item('6', { recorded: true }),
      item('7', { change: { url: PR, merged: false, mergedAt: null } }),
      item('8', { change: null }),
    ])
  ).toEqual({
    print: [{ key: '1', change: PR, at: AT }],
    notPrinted: [
      { key: '2', reason: 'its pull request was found by branch, not named by a run' },
      { key: '3', reason: 'the forge gave no merge time' },
      { key: '4', reason: 'the forge could not say whether it merged' },
      { key: '5', reason: 'the console is still asking the forge; run again' },
    ],
  });
});

test('the printed line quotes its values for the shell', () => {
  expect(mergedLine({ key: "it's", change: PR, at: AT })).toBe(
    `archon workflow merged --item 'it'\\''s' --change '${PR}' --at '${AT}'`
  );
});

test('the report says what to do about each item it did not print', () => {
  const report = backfillReport({
    print: [{ key: '1', change: PR, at: AT }],
    notPrinted: [{ key: '58', reason: 'its pull request was found by branch, not named by a run' }],
  });
  expect(report[0]).toBe(mergedLine({ key: '1', change: PR, at: AT }));
  expect(report).toContain('#   58: its pull request was found by branch, not named by a run');
  expect(report).toContain(
    '#   archon workflow merged --item <key> --change <PR URL> --at <merge time>'
  );
  expect(report.join(' ')).toContain('If it never merged, leave it');
});

test('a run with nothing to record says so', () => {
  expect(backfillReport({ print: [], notPrinted: [] })).toEqual([
    '# Nothing to record: every merged item already carries a merge record.',
  ]);
  // Printed lines alone need no guidance.
  expect(backfillReport({ print: [{ key: '1', change: PR, at: AT }], notPrinted: [] })).toEqual([
    mergedLine({ key: '1', change: PR, at: AT }),
  ]);
});
