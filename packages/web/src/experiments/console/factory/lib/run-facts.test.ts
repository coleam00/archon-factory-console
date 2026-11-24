import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import type { ItemRead, RunRecord } from '../api';
import { shippedListed } from '../item-detail.test-fixtures';
import { factoryWaitingCount } from './attention';
import { factsOf } from './factory-derive';
import { itemProgress } from './item-progress';
import type { FactoryViewListed } from './views';

/**
 * The progress rules the board and item page read, over small hand-made runs and records. The
 * expected values are the ones the engine's own tests held before the derivation moved to the
 * web (packages/workflows/src/factory-items.test.ts at 10cc38270).
 */
const base = (
  JSON.parse(readFileSync(join(import.meta.dir, '__fixtures__', 'item-records.json'), 'utf8')) as {
    '86': { read: ItemRead };
  }
)['86'].read;

type ItemRun = ItemRead['runs'][number];
type Node = RunRecord['node_outcomes']['nodes'][number];

interface Made {
  run: ItemRun;
  record: RunRecord;
}

function made(
  workflow: string,
  id: string,
  startedAt: string,
  shape: {
    status?: ItemRun['status'];
    outcome?: string | null;
    value?: Record<string, unknown>;
    nodes?: Node[];
    failed?: string;
    loops?: RunRecord['loop_iterations'];
  } = {}
): Made {
  const status = shape.status ?? 'completed';
  const ended = status === 'running' ? null : startedAt;
  return {
    run: {
      ...(base.runs[0] as ItemRun),
      id,
      workflow: shippedListed.runNames[workflow] ?? workflow,
      status,
      outcome: shape.outcome ?? null,
      startedAt,
      completedAt: ended,
    },
    record: {
      id,
      status,
      completed_at: ended,
      ...(shape.value === undefined || status === 'running'
        ? {}
        : { returns: { availability: 'available' as const, node_id: 'end', value: shape.value } }),
      node_outcomes: {
        run_id: id,
        first_failed_node: shape.failed ?? null,
        nodes: shape.nodes ?? [],
      },
      loop_iterations: shape.loops ?? [],
      running: [],
    },
  };
}

const progressOf = (runs: Made[], view: FactoryViewListed = shippedListed) => {
  const read: ItemRead = { ...base, runs: runs.map(entry => entry.run) };
  const records = new Map(runs.map(entry => [entry.run.id, entry.record]));
  return itemProgress(view, read, factsOf(view, [read], records), {
    title: null,
    changes: new Map(),
  });
};

/** A stage-check run: its round and allowance in its result, its verdict step's outcome. */
const checkRun = (id: string, at: string, round: number, allowance: number, outcome: string) =>
  made('stage-check', id, at, {
    outcome,
    value: { round, allowance, outcome },
    nodes: [{ node_id: 'verdict__verdict', state: 'completed', output: { outcome } }],
  });

describe('check rounds', () => {
  test('after a replan the rounds start again: only the new cycle is read', () => {
    const progress = progressOf([
      checkRun('c1', '2026-11-21T03:00:00Z', 1, 3, 'return'),
      checkRun('c2', '2026-11-21T04:00:00Z', 2, 3, 'replan'),
      made('stage-build', 'b2', '2026-11-21T05:00:00Z', { outcome: 'built', value: {} }),
      checkRun('c3', '2026-11-21T06:00:00Z', 1, 3, 'return'),
    ]);
    expect(progress?.round).toEqual({
      runId: 'c3',
      iteration: 1,
      max: 3,
      rounds: [{ iteration: 1, verdict: 'returned', outcome: 'return' }],
    });
    expect(progress?.returned).toBe(2);
  });

  test('a loop round is approved only by a declared approval; without one it is undecided', () => {
    const loopView = (approves: boolean): FactoryViewListed => ({
      ...shippedListed,
      declaration: {
        ...shippedListed.declaration,
        rounds: [{ workflow: 'deliver', loop: 'rounds' }],
        returns: [{ workflow: 'deliver', node: 'rounds.verdict__verdict', outcome: 'return' }],
        approves: approves
          ? [{ workflow: 'deliver', node: 'rounds.verdict__verdict', outcome: 'approve' }]
          : [],
      },
    });
    const verdict = (outcome: string, iteration: number): Node => ({
      node_id: 'rounds.verdict__verdict',
      state: 'completed',
      loop_group_path: [{ groupId: 'rounds', iteration }],
      output: { outcome },
    });
    const deliver = made('deliver', 'd1', '2026-11-20T01:00:00Z', {
      outcome: 'ready',
      value: {},
      nodes: [verdict('return', 1), verdict('approve', 2)],
      loops: [
        { group: 'rounds', iteration: 1, max: 3, completed: true },
        { group: 'rounds', iteration: 2, max: 3, completed: true },
      ],
    });
    const verdicts = (approves: boolean) =>
      progressOf([deliver], loopView(approves))?.round?.rounds.map(round => round.verdict);
    expect(verdicts(true)).toEqual(['returned', 'approved']);
    expect(verdicts(false)).toEqual(['returned', 'undecided']);
  });
});

test('a failed run names the step that failed', () => {
  const failed = made('stage-check', 'c1', '2026-11-21T03:00:00Z', {
    status: 'failed',
    failed: 'check__review',
  });
  expect(progressOf([failed])?.runs).toEqual([
    { runId: 'c1', workflow: 'stage-check', failedStep: 'check__review' },
  ]);
});

describe('an item left waiting on a person', () => {
  const shape = made('triage', 't1', '2026-11-16T00:00:00Z', {
    outcome: 'shape',
    value: { why: ' Worth doing. ', open_questions: [' Which surfaces? ', '', 7, 'Who owns it?'] },
  });

  test('carries the declared label and next, and its run’s why and open questions', () => {
    expect(progressOf([shape])?.awaits).toEqual({
      label: 'Needs shaping',
      why: 'Worth doing.',
      questions: ['Which surfaces?', 'Who owns it?'],
      next: shippedListed.declaration.awaits?.['triage:shape']?.next ?? null,
    });
  });

  test('counts once in what needs a person, and a later run takes it up', () => {
    const progress = progressOf([shape]);
    expect(factoryWaitingCount([{ ...base, questions: [], progress }], [])).toBe(1);
    const later = made('plan', 'p1', '2026-11-17T00:00:00Z', { outcome: 'planned', value: {} });
    expect(progressOf([shape, later])?.awaits).toBeNull();
  });
});

test('the change is the newest run that names one: an item re-delivered under a new PR follows it', () => {
  const pr = (n: number) => `https://github.com/acme/web/pull/${String(n)}`;
  const progress = progressOf([
    made('stage-build', 'b1', '2026-11-20T01:00:00Z', {
      outcome: 'built',
      value: { change: pr(1) },
    }),
    made('stage-build', 'b2', '2026-11-21T01:00:00Z', {
      outcome: 'built',
      value: { change: pr(2) },
    }),
    // A newer run naming an empty change does not displace it.
    made('landgate', 'g1', '2026-11-22T01:00:00Z', { outcome: 'land', value: { change: '' } }),
  ]);
  expect(progress?.change?.url).toBe(pr(2));
});
