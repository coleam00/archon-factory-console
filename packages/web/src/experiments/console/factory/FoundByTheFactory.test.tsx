import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { invalidate, set } from '../store/cache';
import { formatDateTime } from '../lib/format';
import { K } from '../store/keys';
import { FoundByTheFactory } from './FoundByTheFactory';
import { DISCOVERIES } from './lib/discoveries.test-fixtures';
import type { ItemName } from '../lib/ask-naming';

// The toggle and the scroll follow a render, which static markup cannot reach.
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
globalThis.fetch = Object.assign(
  async (): Promise<Response> => {
    throw new Error('the server is down');
  },
  { preconnect: originalFetch.preconnect }
);

const ID = 'cb-found';
afterEach(() => {
  invalidate('factory-items');
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

async function mount(
  opened = false,
  above = true,
  oneLine = false,
  names: ReadonlyMap<string, ItemName> = new Map()
) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory/board`]}>
        <FoundByTheFactory
          projectId={ID}
          names={names}
          above={above}
          oneLine={oneLine}
          opened={opened}
        />
      </MemoryRouter>
    )
  );
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test('the count no item covers, the chips, and the shadow badge and line', async () => {
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const { container, unmount } = await mount();
  try {
    expect(container.querySelector('h2')?.textContent).toBe('Found by the factory');
    expect(container.textContent).toContain('shadow');
    expect(container.textContent).toContain('files nothing yet');
    expect(container.querySelector('[data-found-count]')?.textContent).toBe('2');
    const chips = [...container.querySelectorAll('[aria-label="What the drains decided"] li')];
    expect(chips.map(li => li.textContent)).toEqual(['would file 3', 'held 10', 'dropped 16']);
    // One finding an item covers, and one drain that could not be read.
    expect(container.textContent).toMatch(/1 already on the board/);
    expect(container.textContent).toMatch(/1 drain could not be read/);
    // Collapsed until asked.
    expect(container.querySelector('#found-by-the-factory-list')).toBeNull();
  } finally {
    await unmount();
  }
});

test('expanded, a row per open finding with its kind, source item and verified line', async () => {
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const { container, unmount } = await mount();
  try {
    const toggle = container.querySelector('button[aria-expanded]');
    expect(toggle?.textContent).toBe('Show the 2 findings');
    await act(async () => (toggle as unknown as HTMLButtonElement).click());
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const rows = [...container.querySelectorAll('#found-by-the-factory-list > li')];
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    expect(first?.textContent).toContain('Defect');
    expect(first?.textContent).toContain('A dev:console server on a seeded copy');
    expect(first?.textContent).toContain('#58 · Items window read takes ~1.1 s');
    // When that drain decided, as the board's cards word a time.
    expect(first?.textContent).toContain(formatDateTime(DISCOVERIES.findings[0]!.decidedAt));
    expect(first?.querySelector('a')?.getAttribute('href')).toBe(
      '/console/p/cb-found/factory/items/58'
    );
    // The verified line is on hover, and read out to a screen reader.
    expect(first?.getAttribute('title')).toBe(DISCOVERIES.findings[0]?.verified ?? '');
    expect(first?.querySelector('.sr-only')?.textContent).toContain('Verified:');
    expect(second?.textContent).toContain('Cleanup');
    expect(second?.hasAttribute('title')).toBe(false);
    // The covered finding is not listed.
    expect(container.textContent).not.toContain('CI runs the packages');
  } finally {
    await unmount();
  }
});

test('not a shadow: no badge and no line', async () => {
  set(K.factoryDiscoveries(ID), { ...DISCOVERIES, shadow: false });
  const { container, unmount } = await mount();
  try {
    expect(container.textContent).not.toContain('shadow');
    expect(container.textContent).not.toContain('files nothing yet');
    expect(container.textContent).toContain('filed 3');
  } finally {
    await unmount();
  }
});

test('nothing open reads as an empty state, not a zero list', async () => {
  set(K.factoryDiscoveries(ID), { ...DISCOVERIES, findings: [], unreadable: 0 });
  const { container, unmount } = await mount();
  try {
    expect(container.textContent).toContain('Nothing the factory would file now.');
    expect(container.querySelector('button[aria-expanded]')).toBeNull();
  } finally {
    await unmount();
  }
});

test('a read that fails says what could not be read', async () => {
  const { container, unmount } = await mount();
  try {
    for (let turn = 0; turn < 5 && container.querySelector('[role="alert"]') === null; turn++)
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('the server is down');
  } finally {
    await unmount();
  }
});

test('opened on it, the panel scrolls into view once its read answers', async () => {
  const scrolled: unknown[] = [];
  const proto = dom.HTMLElement.prototype as unknown as {
    scrollIntoView: (options?: unknown) => void;
  };
  const original = proto.scrollIntoView;
  proto.scrollIntoView = (options?: unknown): void => {
    scrolled.push(options);
  };
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  // Not while the board above it is still loading: it would be pushed down after.
  const early = await mount(true, false);
  const linked = await mount(true);
  const plain = await mount();
  try {
    expect(scrolled).toEqual([{ block: 'start' }]);
  } finally {
    await early.unmount();
    await linked.unmount();
    await plain.unmount();
    proto.scrollIntoView = original;
  }
});

test('as one line: the count and "show the findings", which opens the full panel listed', async () => {
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const { container, unmount } = await mount(false, true, true);
  try {
    expect(container.querySelector('h2')?.textContent).toBe('Found by the factory');
    expect(container.textContent).toContain('shadow');
    expect(container.querySelector('[data-found-count]')?.textContent).toBe('2');
    expect(container.textContent).toContain('the factory would file');
    // One line: no chips, no shadow sentence, no list yet.
    expect(container.querySelector('ul[aria-label="What the drains decided"]')).toBeNull();
    expect(container.textContent).not.toContain('files nothing yet');
    const open = [...container.querySelectorAll('button')].find(
      button => button.textContent === 'show the findings'
    );
    expect(open).toBeDefined();
    await act(async () => open?.click());
    expect(container.querySelector('ul[aria-label="What the drains decided"]')).not.toBeNull();
    expect(container.querySelectorAll('#found-by-the-factory-list > li')).toHaveLength(2);
  } finally {
    await unmount();
  }
});

test('as one line, opened from the Overview tile, it starts open with its findings listed', async () => {
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const { container, unmount } = await mount(true, true, true);
  try {
    expect(container.textContent).toContain('files nothing yet');
    expect(container.querySelectorAll('#found-by-the-factory-list > li')).toHaveLength(2);
  } finally {
    await unmount();
  }
});

test('a finding from a split member names it under its order; its link keeps the key', async () => {
  const KEY = 'issue-136-item-keys';
  set(K.factoryDiscoveries(ID), {
    ...DISCOVERIES,
    findings: [{ ...DISCOVERIES.findings[0]!, from: { key: KEY, title: null } }],
  });
  const names = new Map([[KEY, { title: null, partOf: 'issue-136' }]]);
  const { container, unmount } = await mount(true, true, true, names);
  try {
    const link = container.querySelector(`#found-by-the-factory-list a[href$="/items/${KEY}"]`);
    expect(link?.textContent).toBe('#136 · item keys');
  } finally {
    await unmount();
  }
});
