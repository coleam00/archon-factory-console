import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { shippedListed } from '../factory/item-detail.test-fixtures';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { ProjectAttentionProvider } from './ProjectAttention';
import { ProjectViewTabs } from './ProjectViewTabs';

// The row measures itself and scrolls on mount, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
/** The tabs' attention stream, which says nothing here. */
class QuietEventSource {
  onmessage: unknown = null;
  onerror: unknown = null;
  readyState = 0;
  close(): void {
    this.readyState = 2;
  }
}
/** A ResizeObserver the tests fire by hand (`resizeAll`), as a browser does on a resize. */
class HandResizeObserver {
  static live = new Set<HandResizeObserver>();
  constructor(private readonly callback: () => void) {}
  observe(): void {
    HandResizeObserver.live.add(this);
  }
  disconnect(): void {
    HandResizeObserver.live.delete(this);
  }
  static resizeAll(): void {
    for (const observer of HandResizeObserver.live) observer.callback();
  }
}
const globals = {
  window: dom,
  document: dom.document,
  EventSource: QuietEventSource,
  ResizeObserver: HandResizeObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');
const originalFetch = globalThis.fetch;
// Anything the tabs read past the seeded views (the attention queue) waits for ever.
globalThis.fetch = Object.assign(() => new Promise<Response>(() => undefined), {
  preconnect: originalFetch.preconnect,
});

afterEach(() => invalidate('factory-views'));
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-tabs';

/** Each tab sits 100 px after the last and is 90 px wide, so `n` tabs are this wide. */
const tabsWide = (n: number): number => n * 100 - 10;

/**
 * The project tabs with `active` open, every element measuring `client` wide inside a `scroll`
 * wide content box (by default as wide as its tabs), each tab as `tabsWide` places it, the
 * factory views seeded unless `views` is false; what `look` reads off the row, given a way to
 * seed the views later.
 */
async function tabsAt<T>(
  sizes: { client: number; scroll?: number },
  active: 'runs' | 'factory',
  look: (row: HTMLElement, seedViews: () => Promise<void>) => T | Promise<T>,
  views = true
): Promise<T> {
  const proto = dom.HTMLElement.prototype;
  const stubbed = {
    clientWidth: () => sizes.client,
    scrollWidth(this: HTMLElement) {
      return sizes.scroll ?? tabsWide(this.children.length);
    },
    offsetWidth: () => 90,
    offsetLeft(this: HTMLElement) {
      const parent = this.parentElement;
      return parent === null ? 0 : [...parent.children].indexOf(this) * 100;
    },
  };
  const originals = Object.keys(stubbed).map(
    key => [key, Object.getOwnPropertyDescriptor(proto, key)] as const
  );
  for (const [key, get] of Object.entries(stubbed))
    Object.defineProperty(proto, key, { configurable: true, get });
  const seedViews = (): void => set(K.factoryViews(ID), { views: [shippedListed], errors: [] });
  if (views) seedViews();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProjectAttentionProvider projectId={ID}>
            <ProjectViewTabs projectId={ID} active={active} />
          </ProjectAttentionProvider>
        </MemoryRouter>
      )
    );
    const row = container.querySelector<HTMLElement>('a')?.parentElement;
    if (row == null) throw new Error('No tab row');
    return await look(row, () => act(async () => seedViews()));
  } finally {
    await act(async () => root.unmount());
    container.remove();
    for (const [key, original] of originals)
      if (original) Object.defineProperty(proto, key, original);
      else Reflect.deleteProperty(proto, key);
  }
}

test('on a phone the project tabs stay one line, scroll sideways and fade the end they hide', async () => {
  const phone = { client: 390, scroll: 520 };
  const row = await tabsAt(phone, 'runs', row => ({
    classes: row.className.split(' '),
    tabs: [...row.querySelectorAll('a')].map(tab => [tab.textContent, tab.className.split(' ')]),
    fadeStart: row.hasAttribute('data-fade-start'),
    fadeEnd: row.hasAttribute('data-fade-end'),
    scrolled: row.scrollLeft,
  }));
  expect(row.classes).toContain('flex-nowrap');
  expect(row.classes).toContain('overflow-x-auto');
  expect(row.classes).not.toContain('flex-wrap');
  expect(row.tabs.map(([label]) => label)).toEqual([
    'Needs you',
    'Runs',
    'Chat',
    'Metrics',
    'Factory',
  ]);
  // No tab squeezes or breaks its label.
  for (const [, classes] of row.tabs) {
    expect(classes).toContain('shrink-0');
    expect(classes).toContain('whitespace-nowrap');
  }
  expect(row).toMatchObject({ fadeStart: false, fadeEnd: true, scrolled: 0 });
});

test('on a phone the active Factory tab, last in the row, is scrolled into view', async () => {
  // Factory sits at 400..490 in a 390 px row: the row scrolls 100 px to show its right edge.
  const scrolled = await tabsAt({ client: 390, scroll: 520 }, 'factory', row => row.scrollLeft);
  expect(scrolled).toBe(100);
});

test('a Factory tab that joins after the views are read fades the end it now overflows', async () => {
  // Four tabs fit 390 px; the fifth, once the views answer, does not.
  const fades = await tabsAt(
    { client: tabsWide(4) },
    'runs',
    async (row, seedViews) => {
      const before = row.hasAttribute('data-fade-end');
      await seedViews();
      return [before, row.querySelectorAll('a').length, row.hasAttribute('data-fade-end')];
    },
    false
  );
  expect(fades).toEqual([false, 5, true]);
});

test('a phone turned to portrait brings the active tab back into view, and only then', async () => {
  // Landscape: all five tabs fit, so the row sits at its start.
  const sizes = { client: tabsWide(5) };
  const scrolls = await tabsAt(sizes, 'factory', async row => {
    const landscape = row.scrollLeft;
    // Portrait narrows the row to 390 px: Factory (400..490) would sit past its end.
    sizes.client = 390;
    await act(async () => HandResizeObserver.resizeAll());
    const portrait = row.scrollLeft;
    // A resize that keeps the row's width (a badge widening a tab) leaves a person's scroll be.
    row.scrollLeft = 20;
    await act(async () => HandResizeObserver.resizeAll());
    return [landscape, portrait, row.scrollLeft];
  });
  expect(scrolls).toEqual([0, 100, 20]);
});
