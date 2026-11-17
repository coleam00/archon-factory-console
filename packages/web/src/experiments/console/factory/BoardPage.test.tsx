import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { Board } from './BoardPage';
import type { FactoryItem } from '../skills/factory';
import { endLastRun, keepRuns, PAGE, realItem, VIEW } from './lib/board.test-fixtures';

// Filtering, sorting and the move highlight follow a re-render, which static markup cannot reach.
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
// Every read comes from the cache the test sets; a fetch would mean a key was missed.
globalThis.fetch = Object.assign(
  async (): Promise<Response> => {
    throw new Error('the board test fetched');
  },
  { preconnect: originalFetch.preconnect }
);

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-1';
afterEach(() => {
  invalidate('factory-items');
});

async function mount(items: FactoryItem[], path = `/console/p/${ID}/factory/board`) {
  set(K.factoryItems(ID), items);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory/board"
            element={<Board projectId={ID} view={VIEW} />}
          />
        </Routes>
      </MemoryRouter>
    )
  );
  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Each column's label and count, as its header shows them. */
const headers = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('h3[data-stage]')].map(h => h.textContent ?? '');

const cardKeys = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('article')].map(
    card => card.querySelector('.font-mono')?.textContent ?? ''
  );

describe('the Pipeline view', () => {
  test('one column per declared stage with its count, every real item in its column', async () => {
    const { container, unmount } = await mount(PAGE.items);
    try {
      expect(headers(container)).toEqual([
        'Order0',
        'Triage0',
        'Plan0',
        'Build4',
        'Checks1',
        'CI and review0',
        'Ready to land0',
        'Landed3',
      ]);
      const checks = container.querySelector('section[aria-label="Checks"]');
      expect(checks?.querySelector('a[title="deliver · rounds.product__product"]')).not.toBeNull();
      // The card opens its item page.
      expect(checks?.querySelector(`a[href="/console/p/${ID}/factory/items/8"]`)).not.toBeNull();
      expect(checks?.querySelector('a[href^="/console/p/cb-1/r/"]')).not.toBeNull();
    } finally {
      await unmount();
    }
  });

  test('the filter narrows the cards by key or title', async () => {
    const { container, unmount } = await mount(PAGE.items);
    try {
      const input = container.querySelector('input[type="search"]') as HTMLInputElement;
      await act(async () => {
        // React listens for the native input event; set the value the way a keystroke does.
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
        setter?.call(input, 'needs you');
        input.dispatchEvent(new dom.Event('input', { bubbles: true }) as unknown as Event);
      });
      expect(cardKeys(container)).toEqual(['7']);
      expect(headers(container)).toContain('Landed1');
    } finally {
      await unmount();
    }
  });

  test('an item an ending took off the board is in the folded row, linking to its page', async () => {
    const closed = endLastRun(keepRuns(realItem('6'), 1), 'completed', 'not-now');
    const { container, unmount } = await mount([closed, realItem('7')]);
    try {
      const folded = container.querySelector('details');
      expect(folded?.querySelector('summary')?.textContent).toBe('1 closed by triage');
      expect(folded?.querySelector('a')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/items/6`
      );
      expect(cardKeys(container)).toEqual(['7']);
    } finally {
      await unmount();
    }
  });

  test('the highlight clears after its time even when a refetch that moves nothing follows', async () => {
    const { container, unmount } = await mount(PAGE.items);
    try {
      const moved = PAGE.items.map(item =>
        item.item.key === '6' ? { ...realItem('8'), item: item.item } : item
      );
      await act(async () => {
        set(K.factoryItems(ID), moved);
      });
      // A second read right after, as several node events bring while checks start.
      await act(async () => {
        set(K.factoryItems(ID), structuredClone(moved));
      });
      expect(container.querySelector('[data-moved="true"]')).not.toBeNull();
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 1600));
      });
      expect(container.querySelector('[data-moved]')).toBeNull();
    } finally {
      await unmount();
    }
  });

  test('a refetch that moves a card marks it moved; one that does not, does not', async () => {
    const { container, unmount } = await mount(PAGE.items);
    try {
      expect(container.querySelector('[data-moved]')).toBeNull();
      // Item 6 starts its deliver run: Build, then Checks once its review runs.
      const delivering = realItem('8');
      const moved = PAGE.items.map(item =>
        item.item.key === '6' ? { ...delivering, item: item.item } : item
      );
      await act(async () => {
        set(K.factoryItems(ID), moved);
      });
      const marked = [...container.querySelectorAll('[data-moved="true"]')].map(
        card => card.querySelector('.font-mono')?.textContent
      );
      expect(marked).toEqual(['6']);
    } finally {
      await unmount();
    }
  });
});

describe('the Table view', () => {
  test('one row per item; a header click sorts by that field', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?view=table`
    );
    try {
      const keys = (): string[] =>
        [...container.querySelectorAll('tbody tr')].map(
          row => row.querySelector('td')?.textContent ?? ''
        );
      // Board order: left to right, then the order the page lists them.
      expect(keys()).toEqual(['5', '4', '6', '3', '8', '7', '2', '1']);
      const header = (label: string): HTMLButtonElement =>
        [...container.querySelectorAll('th button')].find(button =>
          button.textContent?.startsWith(label)
        ) as HTMLButtonElement;
      const firstRow = container.querySelector('tbody tr');
      expect(firstRow?.querySelector('a')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/items/5`
      );
      await act(async () => header('Item').click());
      expect(keys()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      await act(async () => header('Item').click());
      expect(keys()).toEqual(['8', '7', '6', '5', '4', '3', '2', '1']);
      await act(async () => header('Returned').click());
      expect(keys()).toEqual(['5', '4', '6', '8', '7', '3', '2', '1']);
    } finally {
      await unmount();
    }
  });
});

describe('a board opened from a number', () => {
  test('?show=landed with the Table view: only landed rows; Show all brings back the rest', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?show=landed&view=table`
    );
    try {
      const keys = (): string[] =>
        [...container.querySelectorAll('tbody tr')].map(
          row => row.querySelector('td')?.textContent ?? ''
        );
      expect(keys()).toEqual(['7', '2', '1']);
      expect(container.textContent).toContain('Showing: landed');
      const clear = container.querySelector(
        'button[aria-label="Show every item"]'
      ) as HTMLButtonElement;
      await act(async () => clear.click());
      expect(keys()).toEqual(['5', '4', '6', '3', '8', '7', '2', '1']);
      expect(container.textContent).not.toContain('Showing:');
    } finally {
      await unmount();
    }
  });

  test('an unknown ?show= says so and filters nothing', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?show=bogus`
    );
    try {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Unknown filter "bogus"'
      );
      expect(cardKeys(container)).toHaveLength(PAGE.items.length);
    } finally {
      await unmount();
    }
  });
});
