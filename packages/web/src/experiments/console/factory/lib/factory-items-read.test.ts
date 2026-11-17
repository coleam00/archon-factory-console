import { afterEach, expect, jest, mock, test } from 'bun:test';
import type { FactoryItem } from '../../skills/factory';
import type { ItemWindow } from '../../skills/items';
import { deadlineOf, FACTORY_READ_DEADLINE_MS, SlowReadError } from './deadline';
import { readEveryFactoryItem, type FactoryItemsReads } from './factory-items-read';
import { capturedItemsPage } from './fixtures/factory-items-page';

const captured = capturedItemsPage.items;
const within = deadlineOf(FACTORY_READ_DEADLINE_MS);

// A failing fake-timer test must not leave its clock to the tests after it.
afterEach(() => {
  jest.useRealTimers();
});
const read = ({ progress: _progress, ...rest }: FactoryItem): ItemWindow['items'][number] => rest;
const page = (items: FactoryItem[], next: string | null): ItemWindow => ({
  window: { since: '1970-01-01T00:00:00.000Z', until: '2026-11-17T12:00:00.000Z' },
  items: items.map(read),
  next,
});
/** `item` renamed `key`, its runs ending at `at`. */
const at = (item: FactoryItem, key: string, end: string): FactoryItem => ({
  ...item,
  item: { ...item.item, id: `id-${key}`, key },
  runs: item.runs.map(run => ({ ...run, startedAt: end, completedAt: end })),
});

function reads(pages: ItemWindow[], failProgress = false) {
  const windowCalls: Parameters<FactoryItemsReads['listWindow']>[0][] = [];
  const progressCalls: Parameters<FactoryItemsReads['getProgress']>[0][] = [];
  const all = new Map(captured.map(item => [item.item.key, item.progress]));
  const deps: FactoryItemsReads = {
    listWindow: mock(async opts => {
      windowCalls.push(opts);
      return pages[windowCalls.length - 1] ?? page([], null);
    }),
    getProgress: mock(async opts => {
      progressCalls.push(opts);
      if (failProgress) throw new Error('progress failed');
      const keys = typeof opts.keys === 'string' ? [opts.keys] : opts.keys;
      return {
        pack: 'p',
        progress: Object.fromEntries(
          keys.flatMap((k: string) => (all.has(k) ? [[k, all.get(k) ?? null]] : []))
        ),
      };
    }),
  };
  return { deps, windowCalls, progressCalls };
}

test('walks the window from far back, then by its cursor alone, joining each page with its progress', async () => {
  const [first, second] = captured;
  const { deps, windowCalls, progressCalls } = reads([page([first!], 'c1'), page([second!], null)]);
  const items = await readEveryFactoryItem('cb-1', deps, within);
  expect(windowCalls).toEqual([
    { project: 'cb-1', since: '1970-01-01T00:00:00Z', limit: 100 },
    { project: 'cb-1', after: 'c1', limit: 100 },
  ]);
  expect(progressCalls).toEqual([
    { codebaseId: 'cb-1', keys: [first!.item.key] },
    { codebaseId: 'cb-1', keys: [second!.item.key] },
  ]);
  expect(items.map(item => item.progress)).toEqual(
    expect.arrayContaining([first!.progress, second!.progress])
  );
});

test('a key the progress read left out reads as progress null', async () => {
  const stranger = at(captured[0]!, 'stranger', '2026-11-17T00:00:00.000Z');
  const { deps } = reads([page([stranger], null)]);
  const [item] = await readEveryFactoryItem('cb-1', deps, within);
  expect(item?.progress).toBeNull();
});

test('newest activity first, ties by item id, whatever order the window pages in', async () => {
  const base = captured[0]!;
  const { deps } = reads([
    page(
      [at(base, 'old', '2026-11-10T00:00:00.000Z'), at(base, 'b', '2026-11-12T00:00:00.000Z')],
      'c1'
    ),
    page(
      [at(base, 'a', '2026-11-12T00:00:00.000Z'), at(base, 'new', '2026-11-15T00:00:00.000Z')],
      null
    ),
  ]);
  const items = await readEveryFactoryItem('cb-1', deps, within);
  expect(items.map(item => item.item.key)).toEqual(['new', 'a', 'b', 'old']);
});

test('an empty project asks for no progress', async () => {
  const { deps, progressCalls } = reads([page([], null)]);
  expect(await readEveryFactoryItem('cb-1', deps, within)).toEqual([]);
  expect(progressCalls).toEqual([]);
});

test('fails the whole read when a later page, or a progress read, fails', async () => {
  const [first] = captured;
  const failing: FactoryItemsReads = {
    ...reads([]).deps,
    listWindow: mock(async opts => {
      if ('after' in opts && opts.after !== undefined) throw new Error('page two failed');
      return page([first!], 'c1');
    }),
  };
  await expect(readEveryFactoryItem('cb-1', failing, within)).rejects.toThrow('page two failed');
  const { deps } = reads([page([first!], null)], true);
  await expect(readEveryFactoryItem('cb-1', deps, within)).rejects.toThrow('progress failed');
});

test('a progress read that never answers fails the walk at its deadline, and is cancelled', async () => {
  jest.useFakeTimers();
  let progressSignal: AbortSignal | undefined;
  let progressAsked: () => void = () => undefined;
  const asked = new Promise<void>(resolve => {
    progressAsked = resolve;
  });
  const stuck: FactoryItemsReads = {
    listWindow: async () => page(captured.slice(0, 1), null),
    getProgress: (_opts, init) => {
      progressSignal = init?.signal;
      progressAsked();
      return new Promise(() => undefined);
    },
  };
  const walk = readEveryFactoryItem('cb-1', stuck, within).catch((e: unknown) => e);
  // The window page has landed and the progress read is the one waiting.
  await asked;
  jest.advanceTimersByTime(FACTORY_READ_DEADLINE_MS);
  expect(await walk).toBeInstanceOf(SlowReadError);
  expect(progressSignal?.aborted).toBe(true);
});
