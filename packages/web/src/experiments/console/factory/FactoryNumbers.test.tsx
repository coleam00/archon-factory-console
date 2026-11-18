import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import type { FactoryItem } from '../skills/factory';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FactoryNumbers } from './FactoryNumbers';
import { PAGE, readyWithMerge, VIEW } from './lib/board.test-fixtures';
import { cancelRereads, MERGE_REREAD_MS, scheduleReread } from './merge-reread';

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
        <FactoryNumbers projectId="cb-failing" view={VIEW} />
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
  set(K.factoryItems(projectId), items);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <FactoryNumbers projectId={projectId} view={VIEW} />
      </MemoryRouter>
    )
  );
  const tile = (label: string): string | null | undefined =>
    [...container.querySelectorAll('li')].find(li => li.textContent?.endsWith(label))?.textContent;
  return {
    container,
    tile,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test('before the items answer, the five tiles say "…" with their labels, never a count', async () => {
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
          <FactoryNumbers projectId="cb-unread" view={VIEW} />
        </MemoryRouter>
      )
    );
    const tiles = [...container.querySelectorAll('[aria-label="Numbers"] li')];
    expect(tiles.map(li => li.textContent)).toEqual([
      '…Loadingin flight',
      '…Loadingitems need you',
      '…Loadinglanded today',
      '…Loadingdone',
      '…Loadingmedian from first run to landed',
    ]);
    expect(container.querySelector('[aria-label="Numbers"] [title="Loading"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Numbers"]')?.textContent).not.toMatch(/\d/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = held;
  }
});

test('while a merge state is pending, the counts it decides say loading, never zeros', async () => {
  // The cold-load wire value: the server still asking the host whether item 1's change merged.
  const items = [...PAGE.items, readyWithMerge('p', 'pending')];
  const { container, tile, unmount } = await mount('cb-pending', items);
  try {
    for (const label of ['in flight', 'landed today', 'done', 'median from first run to landed'])
      expect(tile(label)).toBe(`…Loading${label}`);
    expect(container.textContent).not.toMatch(/\d+ of \d+/);
    expect(container.querySelector('[title="Loading"]')).toBeNull();
    // Whether an item needs you does not wait on a merge answer.
    expect(tile('items need you')).toBe('0items need you');
    // The answer arrives: real numbers replace the loading ones.
    await act(async () => set(K.factoryItems('cb-pending'), PAGE.items));
    expect(tile('done')).toBe('3 of 8done');
    expect(container.textContent).not.toContain('Loading');
  } finally {
    await unmount();
  }
});

test('a settled unknown is counted as the board places it, not loading', async () => {
  const { container, tile, unmount } = await mount('cb-unknown', [
    ...PAGE.items,
    readyWithMerge('u', 'unknown'),
  ]);
  try {
    expect(tile('done')).toBe('3 of 9done');
    expect(container.textContent).not.toContain('Loading');
  } finally {
    await unmount();
  }
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
    expect(tile('done')).toBe('3 of 8done');
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
    // The read failed: the pending values stay loading, and the note says why.
    expect(tile('done')).toBe('…Loadingdone');
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
