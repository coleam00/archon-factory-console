import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import type { ItemRead, RunDetail, RunRecord } from '../api';
import { shippedListed } from '../item-detail.test-fixtures';
import { deadlineOf } from './deadline';
import { forgetRunRecords } from './factory-derive';
import { readFactoryItem, type FactoryItemReads } from './factory-item-read';
import type { FactoryItemRun } from './progress-types';

const records = (
  JSON.parse(readFileSync(join(import.meta.dir, '__fixtures__', 'item-records.json'), 'utf8')) as {
    '125': { read: ItemRead; records: RunRecord[] };
  }
)['125'];
/** The item page the server composed for item 125 before the web did (`../__fixtures__/item-125.json`). */
const before = (
  JSON.parse(
    readFileSync(join(import.meta.dir, '..', '__fixtures__', 'item-125.json'), 'utf8')
  ) as { response: { runs: FactoryItemRun[] } }
).response.runs;

const PR = 'https://github.com/coleam00/archon-factory-console/pull/128';
/** The first run's detail: two steps, three models recorded across them. */
const firstDetail = {
  run: { status: 'completed' },
  events: [
    { event_type: 'node_started', step_name: 'judge', created_at: '2026-11-22 10:00:00', data: {} },
    {
      event_type: 'node_completed',
      step_name: 'judge',
      created_at: '2026-11-22 10:01:00',
      data: { model: 'm1' },
    },
    { event_type: 'node_started', step_name: 'admit', created_at: '2026-11-22 10:02:00', data: {} },
    {
      event_type: 'node_completed',
      step_name: 'admit',
      created_at: '2026-11-22 10:03:00',
      data: { model: 'm1' },
    },
    {
      event_type: 'node_completed',
      step_name: 'admit',
      created_at: '2026-11-22 10:03:00',
      data: { model: 'm2' },
    },
  ],
} as unknown as RunDetail;

const reads: FactoryItemReads = {
  getItem: async () => records.read,
  view: async () => shippedListed,
  getRunRecords: async ids => ({
    records: records.records.filter(record => ids.includes(record.id)),
    missing: [],
    unreadable: [],
  }),
  getRunDetail: async runId =>
    runId === records.read.runs[0]?.id
      ? firstDetail
      : ({ run: { status: 'completed' }, events: [] } as unknown as RunDetail),
  getForgeSubjects: async query => ({
    issues: query.issues.map(number => ({
      number,
      title: 'From the issue',
      state: 'closed' as const,
      url: null,
      pending: false,
    })),
    changes: query.changes.map(change => ({
      run: change.run,
      url: PR,
      merged: true,
      mergedAt: '2026-11-22T07:58:04.000Z',
      number: 128,
    })),
  }),
};

test("an item page tells each run's workflow, cost, change, rounds and words as the server did", async () => {
  forgetRunRecords();
  const detail = await readFactoryItem('cb', '125', reads, deadlineOf(5_000));
  expect(detail.item.progress?.title).toBe('From the issue');
  expect(detail.item.progress?.change).toMatchObject({ url: PR, merged: true, number: 128 });
  const summary = (runs: readonly FactoryItemRun[]) =>
    runs.map(run => ({
      runId: run.runId,
      workflow: run.workflow,
      costUsd: run.costUsd,
      change: run.change,
      rounds:
        run.rounds?.rounds.map(({ iteration, verdict, outcome }) => ({
          iteration,
          verdict,
          outcome,
        })) ?? null,
      // The record fixture cuts long strings to 60 characters.
      said: run.said?.slice(0, 50) ?? null,
    }));
  expect(summary(detail.runs)).toEqual(summary(before));
});

test("a run's models and step starts come from its events, in order, each model once", async () => {
  forgetRunRecords();
  const [first] = (await readFactoryItem('cb', '125', reads, deadlineOf(5_000))).runs;
  expect(first?.models).toEqual(['m1', 'm2']);
  expect(first?.steps).toEqual([
    { node: 'judge', startedAt: '2026-11-22T10:00:00.000Z' },
    { node: 'admit', startedAt: '2026-11-22T10:02:00.000Z' },
  ]);
});
