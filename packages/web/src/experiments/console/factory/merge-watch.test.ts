import { afterEach, expect, test } from 'bun:test';
import type { FactoryItem } from './api';
import { get, invalidate, set } from '../store/cache';
import { FK } from './keys';
import { readyWithMerge } from './lib/board.test-fixtures';
import type { FactoryItemsRead } from './lib/factory-items-read';
import { cancelMergeWatches, watchMerges, type MergeWatchDeps } from './merge-watch';

afterEach(() => {
  cancelMergeWatches();
  invalidate('runs:factory-items');
});

/** Enough turns for several ticks at a zero delay to ask and settle. */
const ticks = async (n = 5): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise(resolve => setTimeout(resolve, 1));
};

type Merged = NonNullable<NonNullable<FactoryItem['progress']>['change']>['merged'];

const runOf = (key: string): string => `run-${key}`;

/**
 * A forge read that records the items each request asks about (by their change's run) and
 * answers each from `state` (merged `false` for one it does not name), or rejects while
 * `fail` is set.
 */
function forge(state: Record<string, Merged> = {}) {
  const asked: string[][] = [];
  const fake = {
    asked,
    fail: false,
    state,
    getForgeSubjects: (async ({ changes }) => {
      const keys = changes.map(change => change.run.replace(/^run-/, ''));
      asked.push(keys);
      if (fake.fail) throw new Error('the forge is down');
      return {
        issues: [],
        changes: keys.map(key => ({
          run: runOf(key),
          ...readyWithMerge(key, state[key] ?? false).progress!.change!,
        })),
      };
    }) as MergeWatchDeps['getForgeSubjects'],
  };
  return fake;
}

const read = (projectId: string): FactoryItemsRead =>
  get(FK.factoryItems(projectId)) as FactoryItemsRead;
const seed = (projectId: string, items: FactoryItem[]): void =>
  set(FK.factoryItems(projectId), {
    items,
    members: {},
    lookups: Object.fromEntries(
      items.map(item => [
        item.item.key,
        { run: runOf(item.item.key), url: item.progress?.change?.url ?? '' },
      ])
    ),
    titlesPending: false,
  });

test('once the forge says merged, the item is merged and nothing more is asked', async () => {
  seed('cb-merge', [readyWithMerge('b', false)]);
  const host = forge({ b: true });
  const release = watchMerges('cb-merge', { getForgeSubjects: host.getForgeSubjects, delayMs: 0 });
  try {
    await ticks();
    expect(read('cb-merge').items[0]?.progress?.change?.merged).toBe(true);
    expect(host.asked).toEqual([['b']]);
  } finally {
    release();
  }
});

test('a failed ask keeps the board as it was and asks again next time', async () => {
  seed('cb-fail', [readyWithMerge('b', false)]);
  const before = read('cb-fail');
  const host = forge({ b: true });
  host.fail = true;
  const warn = console.warn;
  console.warn = () => undefined;
  const release = watchMerges('cb-fail', { getForgeSubjects: host.getForgeSubjects, delayMs: 0 });
  try {
    await ticks(3);
    expect(host.asked.length).toBeGreaterThan(1);
    expect(read('cb-fail')).toBe(before);
    host.fail = false;
    await ticks();
    expect(read('cb-fail').items[0]?.progress?.change?.merged).toBe(true);
  } finally {
    console.warn = warn;
    release();
  }
});

test('an item that leaves the board, or the last release, stops the asking', async () => {
  seed('cb-leave', [readyWithMerge('b', false)]);
  const host = forge();
  const release = watchMerges('cb-leave', { getForgeSubjects: host.getForgeSubjects, delayMs: 0 });
  let afterLeaving = 0;
  try {
    await ticks(2);
    expect(host.asked.length).toBeGreaterThan(0);
    seed('cb-leave', [readyWithMerge('a', true)]);
    await ticks(1);
    afterLeaving = host.asked.length;
    await ticks();
    expect(host.asked.length).toBe(afterLeaving);
    seed('cb-leave', [readyWithMerge('b', false)]);
  } finally {
    release();
  }
  await ticks();
  expect(host.asked.length).toBe(afterLeaving);
});

test('an open item page takes the answer too, so its header agrees with the board', async () => {
  const item = readyWithMerge('b', false);
  seed('cb-detail', [item]);
  const detailKey = FK.factoryItem('cb-detail', 'b');
  set(detailKey, { item, runs: [] });
  const host = forge({ b: true });
  const release = watchMerges('cb-detail', { getForgeSubjects: host.getForgeSubjects, delayMs: 0 });
  try {
    await ticks(1);
    const detail = get(detailKey) as { item: FactoryItem };
    expect(detail.item.progress?.change?.merged).toBe(true);
  } finally {
    release();
    invalidate(detailKey);
  }
});
