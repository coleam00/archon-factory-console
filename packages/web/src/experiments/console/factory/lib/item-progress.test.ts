import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ItemRead, RunRecord } from '../api';
import { shippedListed } from '../item-detail.test-fixtures';
import { factsOf, lookupsOf } from './factory-derive';
import { itemProgress } from './item-progress';
import { mergePending } from './merge-pending';
import { itemColumn, pageRunFacts, placementInput, stageIdOf } from './placement';
import type { FactoryChange, FactoryItemProgress } from './progress-types';

/** Real items, their runs' records and the progress the server derived (see the file's `note`). */
const captured = JSON.parse(
  readFileSync(join(import.meta.dir, '__fixtures__', 'item-records.json'), 'utf8')
) as Record<'86' | '125', { read: ItemRead; records: RunRecord[]; expected: FactoryItemProgress }>;

const view = shippedListed;
const derive = (
  read: ItemRead,
  records: readonly RunRecord[],
  changes: ReadonlyMap<string, FactoryChange> = new Map(),
  title: string | null = null
) =>
  itemProgress(view, read, factsOf(view, [read], new Map(records.map(r => [r.id, r]))), {
    title,
    changes,
  });
const columnOf = (read: ItemRead, progress: FactoryItemProgress | null) =>
  stageIdOf(
    itemColumn(
      view.declaration,
      placementInput({ ...read, progress }, progress === null ? new Map() : pageRunFacts(progress))
    )
  );

describe('an item read from its runs', () => {
  const { read, records, expected } = captured['125'];
  const lookup = lookupsOf(
    view,
    [read],
    factsOf(view, [read], new Map(records.map(r => [r.id, r])))
  );

  test('counts its check rounds since it was planned, and every time it was sent back', () => {
    const progress = derive(read, records);
    expect(progress?.round).toEqual(expected.round);
    expect(progress?.returned).toBe(4);
    expect(progress?.runs).toEqual(expected.runs);
  });

  test("a recorded merge shows merged, as the forge's answer for its change says", () => {
    const run = lookup.get('125')?.run ?? '';
    const merged = new Map([[run, expected.change!]]);
    const progress = derive(read, records, merged);
    expect(progress?.change).toEqual(expected.change);
    expect(columnOf(read, progress)).toBe(view.declaration.landed.stage);
  });

  test('a change the forge has not answered is pending, so the board reads it again', () => {
    const progress = derive(read, records);
    expect(progress?.change).toMatchObject({ url: expected.change?.url, merged: 'pending' });
    expect(mergePending({ ...read, progress })).toBe(true);
  });

  test('a run whose record could not be read leaves the progress unknown, not partial', () => {
    expect(derive(read, records.slice(1))).toBeNull();
  });

  test("the title is the forge's, and none without it", () => {
    expect(derive(read, records, new Map(), 'From the issue')?.title).toBe('From the issue');
    expect(derive(read, records)?.title).toBeNull();
  });
});

test('an item its last run parked carries the label and the run’s own reason', () => {
  const { read, records, expected } = captured['86'];
  expect(derive(read, records)?.parked).toEqual(expected.parked);
});

test('a running run puts the item on its deepest running step', () => {
  const { read, records } = captured['125'];
  const last = read.runs.at(-1)!;
  const running: ItemRead = {
    ...read,
    runs: read.runs.map(run =>
      run.id === last.id ? { ...run, status: 'running', outcome: null, completedAt: null } : run
    ),
  };
  const live = records.map(record =>
    record.id === last.id
      ? { ...record, status: 'running' as const, running: ['wait', 'rounds', 'rounds.review'] }
      : record
  );
  expect(derive(running, live)?.running).toMatchObject({ runId: last.id, step: 'rounds.review' });
});

test('a merge recorded on an item with no change lookup shows merged without the forge', () => {
  const { read } = captured['86'];
  const merged = { ...read, merged: { ...mergeOf(), change: 'https://x/pull/9' } };
  expect(derive(merged, captured['86'].records)?.change).toEqual({
    url: 'https://x/pull/9',
    merged: true,
    mergedAt: '2026-11-20T12:00:00.000Z',
    number: null,
  });
});

function mergeOf(): NonNullable<ItemRead['merged']> {
  return {
    change: '',
    commit: null,
    at: '2026-11-20T12:00:00.000Z',
    recordedAt: '2026-11-20T12:00:00.000Z',
    via: 'cli',
    fromRun: null,
  };
}
