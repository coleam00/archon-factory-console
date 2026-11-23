import { afterAll, afterEach, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import type { FactoryItem } from '../skills/factory';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FactoryNumbers } from './FactoryNumbers';
import { PAGE, readyWithMerge, VIEW } from './lib/board.test-fixtures';
import { mergeUnsettled } from './lib/merge-pending';
import { DISCOVERIES } from './lib/discoveries.test-fixtures';
import { cancelRereads, MERGE_REREAD_MS, scheduleReread } from './merge-reread';
import { cancelMergeWatches, MERGE_WATCH_MS, mergeWatchHeld } from './merge-watch';

// A failed read lands after the first render, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');

/** What a tile says before where it goes: the link's last span, for a screen reader only. */
const shown = (el: Element | null | undefined): string | null | undefined => {
  if (el === null || el === undefined) return el;
  const copy = el.cloneNode(true) as Element;
  const opens = copy.querySelector('a')?.lastElementChild;
  if (opens?.classList.contains('sr-only') === true) opens.remove();
  return copy.textContent;
};
/** The project's asks and waits, as the Overview hands them down. */
const WAITING = 2;
const originalFetch = globalThis.fetch;
let fetches = 0;
globalThis.fetch = Object.assign(
  async (): Promise<Response> => {
    fetches++;
    throw new Error('the server is down');
  },
  { preconnect: originalFetch.preconnect }
);

afterEach(() => {
  // A pending read schedules a re-read; it must not fire into the next test.
  cancelRereads();
  cancelMergeWatches();
  jest.useRealTimers();
  invalidate('factory-items');
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  invalidate('factory-items');
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('a failed read says so, and never shows zeros', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FactoryNumbers projectId="cb-failing" view={VIEW} waiting={WAITING} />
      </MemoryRouter>
    )
  );
  // The loader's rejection settles on the next turns.
  for (let turn = 0; turn < 5 && container.querySelector('[role="alert"]') === null; turn++)
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  try {
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The numbers could not be loaded');
    expect(alert?.textContent).toContain('the server is down');
    expect(container.textContent).not.toContain('in flight');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

const turns = async (n = 5): Promise<void> => {
  for (let turn = 0; turn < n; turn++)
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
};

/** The strip over `items`, read warm from the cache as the Overview reads it after the board. */
async function mount(projectId: string, items: FactoryItem[]) {
  set(K.factoryItems(projectId), { items: items, members: {} });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FactoryNumbers projectId={projectId} view={VIEW} waiting={WAITING} />
      </MemoryRouter>
    )
  );
  const tile = (label: string): string | null | undefined =>
    shown(container.querySelector(`li[data-tile="${label}"]`));
  return {
    container,
    tile,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test('before the reads answer, every tile shows a skeleton figure, never a count or "…"', async () => {
  // Held unanswered: the strip renders before its first read settles.
  const held = globalThis.fetch;
  globalThis.fetch = Object.assign(() => new Promise<Response>(() => undefined), {
    preconnect: originalFetch.preconnect,
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <FactoryNumbers projectId="cb-unread" view={VIEW} waiting={undefined} />
        </MemoryRouter>
      )
    );
    const tiles = [...container.querySelectorAll('[aria-label="Numbers"] li')];
    // Each tile is its label, then a skeleton bar (Visual standard, rule 6) said as loading.
    expect(tiles.map(li => shown(li))).toEqual([
      'in flightLoading',
      'need youLoading',
      'merged todayLoading',
      'mergedLoading',
      'median to mergedLoading',
      // Its own read.
      'found by the factoryLoading',
    ]);
    expect(
      tiles.every(
        li =>
          li.querySelector('[data-skeleton="figure"]') !== null && li.querySelector('svg') !== null
      )
    ).toBe(true);
    expect(container.textContent).not.toContain('…');
    expect(container.querySelector('[aria-label="Numbers"] [title="Loading"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Numbers"]')?.textContent).not.toMatch(/\d/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = held;
  }
});

test('while a merge state is pending, the counts it decides show what is known and a skeleton for the rest', async () => {
  // The cold-load wire value: the server still asking the host whether item 1's change merged.
  const items = [...PAGE.items, readyWithMerge('p', 'pending')];
  const { container, tile, unmount } = await mount('cb-pending', items);
  try {
    // The pending item is in M, and in no other count.
    expect(tile('merged')).toBe('merged3 of 9Checking which changes merged');
    expect(tile('in flight')).toBe('in flight4Checking which changes merged');
    for (const label of ['merged today', 'median to merged'])
      expect(tile(label)).toContain('Checking which changes merged');
    expect(container.querySelector('[title="Loading"]')).toBeNull();
    // The asks and waits that need you do not wait on a merge answer: the queue counts them.
    expect(tile('need you')).toBe('need you2');
    // The answer arrives: real numbers replace the loading ones.
    // Every state answered (item 3's unknown one left out here): the skeletons go.
    const settled = PAGE.items.filter(item => !mergeUnsettled(item));
    await act(async () => set(K.factoryItems('cb-pending'), { items: settled, members: {} }));
    expect(tile('merged')).toBe('merged3 of 7');
    expect(container.textContent).not.toContain('Checking');
  } finally {
    await unmount();
  }
});

test('a settled unknown is left out of the counts as a pending one is', async () => {
  const { container, tile, unmount } = await mount('cb-unknown', [
    ...PAGE.items,
    readyWithMerge('u', 'unknown'),
  ]);
  try {
    // A failed lookup is not known either: left out of the counts, a skeleton beside them.
    expect(tile('merged')).toBe('merged3 of 9Checking which changes merged');
  } finally {
    await unmount();
  }
});

test('a merge on the forge reaches the numbers on the watch interval, with no run event', async () => {
  const mergedAt = new Date().toISOString();
  const waiting = readyWithMerge('w', false);
  const asked: string[] = [];
  const held = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async (input: string | URL | Request): Promise<Response> => {
      const url = new URL(String(input), 'http://localhost');
      if (url.pathname !== '/api/factory/progress') throw new Error('the server is down');
      asked.push(url.searchParams.getAll('keys').join(','));
      const answer = readyWithMerge('w', true).progress;
      if (answer?.change) answer.change.mergedAt = mergedAt;
      return Response.json({ pack: 'p', progress: { w: answer }, members: {} });
    },
    { preconnect: originalFetch.preconnect }
  );
  // The watch's interval is the only clock here: nothing invalidates the key.
  jest.useFakeTimers();
  const items = [...PAGE.items, waiting];
  const { tile, unmount } = await mount('cb-watch', items);
  try {
    expect(tile('merged')).toBe(`merged3 of 9Checking which changes merged`);
    expect(tile('merged today')).toBe(`merged today0Checking which changes merged`);
    jest.advanceTimersByTime(MERGE_WATCH_MS - 1);
    expect(asked).toEqual([]);
    await act(async () => {
      jest.advanceTimersByTime(1);
      for (let turn = 0; turn < 5; turn++) await Promise.resolve();
    });
    for (let turn = 0; turn < 5 && !tile('merged').startsWith('merged4 of 9'); turn++)
      await act(async () => Promise.resolve());
    // Only the keys whose change is not merged were asked about, not the whole board.
    expect(asked).toEqual(['8,3,w']);
    expect(tile('merged')).toBe(`merged4 of 9Checking which changes merged`);
    expect(tile('merged today')).toBe(`merged today1Checking which changes merged`);
  } finally {
    globalThis.fetch = held;
    await unmount();
  }
});

test('the page holds the merge watch only while a change waits on a merge', async () => {
  const { unmount } = await mount('cb-held', [readyWithMerge('m', true)]);
  const items = async (list: FactoryItem[]) =>
    act(async () => set(K.factoryItems('cb-held'), { items: list, members: {} }));
  try {
    expect(mergeWatchHeld('cb-held')).toBe(false);
    await items([readyWithMerge('m', true), readyWithMerge('w', false)]);
    expect(mergeWatchHeld('cb-held')).toBe(true);
    // It merges.
    await items([readyWithMerge('m', true), readyWithMerge('w', true)]);
    expect(mergeWatchHeld('cb-held')).toBe(false);
    await items([readyWithMerge('w', 'unknown')]);
    expect(mergeWatchHeld('cb-held')).toBe(true);
    // It leaves the board.
    await items([readyWithMerge('m', true)]);
    expect(mergeWatchHeld('cb-held')).toBe(false);
    await items([readyWithMerge('w', false)]);
  } finally {
    await unmount();
  }
  // The last reader gone, nothing holds it.
  expect(mergeWatchHeld('cb-held')).toBe(false);
});

test('a failed refresh says so and keeps the last numbers', async () => {
  const { container, tile, unmount } = await mount('cb-stale', PAGE.items);
  try {
    // The refresh reads through the fetch above, which fails.
    await act(async () => invalidate(K.factoryItems('cb-stale')));
    await turns();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(
      'Could not refresh: the server is down. Showing the last values read.'
    );
    expect(tile('merged')).toBe(`merged3 of 8Checking which changes merged`);
  } finally {
    await unmount();
  }
});

test('while pending it reads again on its own, and keeps trying after a failed read', async () => {
  const items = [...PAGE.items, readyWithMerge('p', 'pending')];
  const { container, tile, unmount } = await mount('cb-reread', items);
  try {
    const before = fetches;
    // Nothing invalidates the key here: only the hook's own re-read can fetch.
    await act(async () => new Promise(resolve => setTimeout(resolve, MERGE_REREAD_MS + 100)));
    await turns();
    expect(fetches).toBeGreaterThan(before);
    // The read failed: the pending item stays left out, and the note says why.
    expect(tile('merged')).toBe('merged3 of 9Checking which changes merged');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Could not refresh');
    // The failure scheduled the next re-read: a timer holds the key, so this one is a no-op.
    const after = fetches;
    scheduleReread(K.factoryItems('cb-reread'), 0);
    await turns();
    expect(fetches).toBe(after);
  } finally {
    await unmount();
  }
});

test('a view that declares discoveries adds a tile linking to the board panel; one that does not, none', async () => {
  set(K.factoryItems('cb-found'), { items: PAGE.items, members: {} });
  set(K.factoryDiscoveries('cb-found'), DISCOVERIES);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const { discoveries: _declared, ...without } = VIEW;
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <FactoryNumbers projectId="cb-found" view={VIEW} waiting={WAITING} />
        </MemoryRouter>
      )
    );
    const found = [...container.querySelectorAll('[aria-label="Numbers"] li')].at(-1);
    // Two of the three findings: an item carries the third.
    expect(shown(found)).toBe('found by the factory2');
    const link = found?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/console/p/cb-found/factory/board?show=found');
    await act(async () =>
      root.render(
        <MemoryRouter>
          <FactoryNumbers projectId="cb-found" view={without} waiting={WAITING} />
        </MemoryRouter>
      )
    );
    expect(container.querySelectorAll('[aria-label="Numbers"] li')).toHaveLength(5);
    expect(container.textContent).not.toContain('found by the factory');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    invalidate(K.factoryDiscoveries('cb-found'));
  }
});
