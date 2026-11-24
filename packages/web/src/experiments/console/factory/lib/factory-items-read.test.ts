import { expect, test } from 'bun:test';
import type { FactoryItem, ItemRead, ItemWindow } from '../api';
import { HttpError } from '../../lib/http';
import { shippedListed } from '../item-detail.test-fixtures';
import { deadlineOf, FACTORY_READ_DEADLINE_MS } from './deadline';
import { readEveryFactoryItem, type FactoryItemsReads } from './factory-items-read';
import { capturedItemsPage, itemsReadAnswer } from './fixtures/factory-items-page';

const captured = capturedItemsPage.items;
const within = deadlineOf(FACTORY_READ_DEADLINE_MS);

const read = ({ progress: _progress, ...rest }: FactoryItem): ItemRead => rest;
const page = (items: FactoryItem[], next: string | null): ItemWindow => ({
  window: { since: '1970-01-01T00:00:00.000Z', until: '2026-11-17T12:00:00.000Z' },
  items: items.map(read),
  next,
});
/** `item` renamed `key`, its runs (given their own ids) ending at `end`. */
const at = (item: FactoryItem, key: string, end: string): FactoryItem => ({
  ...item,
  item: { ...item.item, id: `id-${key}`, key },
  runs: item.runs.map(run => ({
    ...run,
    id: `${key}-${run.id}`,
    startedAt: end,
    completedAt: end,
  })),
  progress: null,
});

/**
 * The reads the walk goes through, answered for `items` as the stubbed server answers them.
 * `rows` are the items the project has beyond the window's (a work order with no run).
 */
function reads(pages: ItemWindow[], items: FactoryItem[], rows: ItemRead[] = []) {
  const windowCalls: Parameters<FactoryItemsReads['listWindow']>[0][] = [];
  const itemCalls: string[] = [];
  const answer = itemsReadAnswer(items);
  const json = async <T>(path: string, query: URLSearchParams): Promise<T> =>
    (await answer(`${path}?${query.toString()}`).json()) as T;
  const deps: FactoryItemsReads = {
    listWindow: async opts => {
      windowCalls.push(opts);
      return pages[windowCalls.length - 1] ?? page([], null);
    },
    view: async () => shippedListed,
    getRunRecords: async ids =>
      json('/api/workflows/runs/records', new URLSearchParams(ids.map(id => ['runId', id]))),
    getForgeSubjects: async opts =>
      json(
        '/api/forge/subjects',
        new URLSearchParams([
          ...opts.issues.map(issue => ['issue', String(issue)]),
          ...opts.changes.flatMap(c => [
            ['changeRun', c.run],
            ['changeUrl', c.url],
          ]),
        ])
      ),
    getItem: async ({ key }) => {
      itemCalls.push(key);
      const row = rows.find(entry => entry.item.key === key);
      if (row === undefined) throw new HttpError(404, '/api/items', '');
      return row;
    },
  };
  return { deps, windowCalls, itemCalls };
}

test('walks the window from far back, then by its cursor alone, and derives each item', async () => {
  const [first, second] = captured;
  const { deps, windowCalls } = reads(
    [page([first!], 'c1'), page([second!], null)],
    [first!, second!]
  );
  const { items } = await readEveryFactoryItem('cb-1', deps, within);
  expect(windowCalls).toEqual([
    { project: 'cb-1', since: '1970-01-01T00:00:00Z', limit: 100 },
    { project: 'cb-1', after: 'c1', limit: 100 },
  ]);
  // Each item lands on the step its running run is on.
  expect(items.map(item => [item.item.key, item.progress?.running?.step])).toEqual(
    expect.arrayContaining([
      [first!.item.key, first!.progress?.running?.step],
      [second!.item.key, second!.progress?.running?.step],
    ])
  );
});

test('newest activity first, ties by item id, whatever order the window pages in', async () => {
  const base = captured[0]!;
  const items = [
    at(base, 'old', '2026-11-10T00:00:00.000Z'),
    at(base, 'b', '2026-11-12T00:00:00.000Z'),
    at(base, 'a', '2026-11-12T00:00:00.000Z'),
    at(base, 'new', '2026-11-15T00:00:00.000Z'),
  ];
  const { deps } = reads([page(items.slice(0, 2), 'c1'), page(items.slice(2), null)], items);
  const read = await readEveryFactoryItem('cb-1', deps, within);
  expect(read.items.map(item => item.item.key)).toEqual(['new', 'a', 'b', 'old']);
});

/** A `part_of` link from or to the item `other` keys. */
const link = (other: string, direction: 'outgoing' | 'incoming') => ({
  id: `link-${other}-${direction}`,
  kind: 'part_of' as const,
  direction,
  other: { id: `id-${other}`, projectKey: 'p', key: other },
  at: '2026-11-17T00:00:00.000Z',
  via: 'cli' as const,
  by: null,
  fromRun: null,
  ended: null,
});

test('members come from links; an order the window lacks is read by key, and one with no row is left out', async () => {
  const base = captured[0]!;
  const member = (key: string, order: string): FactoryItem => ({
    ...at(base, key, '2026-11-17T00:00:00.000Z'),
    links: [link(order, 'outgoing')],
  });
  const items = [member('49', '48'), member('50', '48'), member('52', '60')];
  // 48 has an item row and no run; 60 has no row at all.
  const order: ItemRead = {
    ...read(at(base, '48', '2026-11-17T00:00:00.000Z')),
    runs: [],
    links: ['49', '50', '51'].map(key => link(key, 'incoming')),
  };
  const { deps, itemCalls } = reads([page(items, null)], items, [order]);
  const result = await readEveryFactoryItem('cb-1', deps, within);
  expect(itemCalls.sort()).toEqual(['48', '60']);
  // 51 is linked and has no run: it is no item, and counts as 48's member.
  expect(result.items.map(item => item.item.key).sort()).toEqual(['49', '50', '52']);
  expect(result.members['48']).toEqual(['49', '50', '51']);
  expect('60' in result.members).toBe(false);
});

test('a project with more runs than one records request holds is read a page at a time', async () => {
  // Each item has one run; 150 of them is more than the server's 100 ids a request.
  const items = Array.from({ length: 150 }, (_, i) =>
    at(captured[0]!, `k${String(i)}`, '2026-11-17T00:00:00.000Z')
  );
  const { deps } = reads([page(items, null)], items);
  const asked: number[] = [];
  const paged: FactoryItemsReads = {
    ...deps,
    getRunRecords: async (ids, fields, init) => {
      asked.push(ids.length);
      // As the server answers: more than 100 ids is a 400.
      if (ids.length > 100) throw new HttpError(400, '/api/workflows/runs/records', '');
      return deps.getRunRecords(ids, fields, init);
    },
  };
  const read = await readEveryFactoryItem('cb-1', paged, within);
  expect(Math.max(...asked)).toBeLessThanOrEqual(100);
  expect(read.items.every(item => item.progress !== null)).toBe(true);
});
