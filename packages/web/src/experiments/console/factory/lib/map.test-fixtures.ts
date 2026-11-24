import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FactoryItem } from '../../skills/factory';
import type { ChangeMerged } from './merge-pending';

const seeded = (
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', 'map-items.json'), 'utf8')) as {
    items: FactoryItem[];
  }
).items;

/** A real item from the seeded console home, by its key. */
export function realItem(key: string): FactoryItem {
  const item = seeded.find(entry => entry.item.key === key);
  if (item === undefined) throw new Error(`No fixture item ${key}`);
  return structuredClone(item);
}

type ItemRun = FactoryItem['runs'][number];
type Progress = NonNullable<FactoryItem['progress']>;

/** One run of a declared workflow, as a test describes it. */
export interface TestRun {
  workflow: string;
  status: ItemRun['status'];
  outcome?: string | null;
  /** The running step, for a running run. */
  step?: string | null;
}

export const run = (
  workflow: string,
  status: ItemRun['status'],
  outcome: string | null = null,
  step: string | null = null
): TestRun => ({ workflow, status, outcome, step });

/**
 * Item `key` with `runs` in start order, read as the items read returns it: the runs on the
 * item read with their recorded names, and `progress.runs` and `running` with the declared ones.
 */
export function itemWith(
  key: string,
  runs: readonly TestRun[],
  merged: ChangeMerged | null = null
): FactoryItem {
  const base = realItem('6');
  const template = base.runs[0] as ItemRun;
  const ids = runs.map((_, index) => `run-${key}-${index.toString()}`);
  const runningIndex = runs.map(entry => entry.status).lastIndexOf('running');
  const running = runs[runningIndex];
  const progress: Progress = {
    ...(base.progress as Progress),
    runs: runs.map((entry, index) => ({
      runId: ids[index] ?? '',
      workflow: entry.workflow,
      failedStep: null,
    })),
    running:
      running === undefined
        ? null
        : {
            runId: ids[runningIndex] ?? '',
            workflow: running.workflow,
            step: running.step ?? null,
            startedAt: '2026-11-17T05:00:00.000Z',
          },
    change:
      merged === null
        ? null
        : { url: 'https://example.test/pull/1', merged, mergedAt: null, number: 1 },
  };
  return {
    ...base,
    item: { ...base.item, id: `item-${key}`, key },
    runs: runs.map((entry, index) => ({
      ...template,
      id: ids[index] ?? '',
      workflow: `Wirasm/archon-software-factory:${entry.workflow}`,
      status: entry.status,
      outcome: entry.outcome ?? null,
    })),
    progress,
  };
}

/** Item `key` whose progress the server could not derive. */
export function itemWithoutProgress(key: string): FactoryItem {
  const base = realItem('6');
  return { ...base, item: { ...base.item, id: `item-${key}`, key }, progress: null };
}

/*
 * Synthetic: the live factory has not yet restarted a stage on settled asks. Each item's first
 * run left three asks, answered and withdrawn at `settledAt`, which closes the set; `restarted`
 * adds the run the settling started.
 */
export function settledItem(
  key: string,
  asking: TestRun,
  settledAt: string,
  restarted?: TestRun
): FactoryItem {
  const item = itemWith(key, restarted === undefined ? [asking] : [asking, restarted]);
  const askingId = item.runs[0]?.id ?? '';
  return {
    ...item,
    runs: item.runs.map((entry, index) =>
      index === 1 ? { ...entry, cause: { kind: 'asks_settled', runId: askingId } } : entry
    ),
    answers: [
      // The set's asks: two answered and one withdrawn, as its settled entry counts them.
      ...(['approve', 'split', null] as const).map((chosen, index) => ({
        kind: 'ask' as const,
        runId: askingId,
        node: null,
        occurrence: null,
        at: settledAt,
        via: 'cli',
        ref: `ask:${key}-${index.toString()}`,
        question: `Question ${(index + 1).toString()} on ${key}?`,
        answer: null,
        chosen: chosen === null ? null : { id: chosen, does: `Does ${chosen}.` },
        withdrawn: chosen === null,
        by: { declared: 'cole-owner' },
        fromRun: null,
      })),
      {
        kind: 'asks_settled',
        runId: askingId,
        node: null,
        occurrence: null,
        at: settledAt,
        via: null,
        answered: 2,
        withdrawn: 1,
      },
    ],
  };
}
