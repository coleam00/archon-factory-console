import { afterAll, afterEach, expect, test } from 'bun:test';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { shippedListed } from '../factory/item-detail.test-fixtures';
import { askItem } from '../lib/needs-you.test-fixtures';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { installDom } from '../test-dom.test-helpers';
import { ProjectAttentionProvider } from './ProjectAttention';
import { ProjectViewTabs } from './ProjectViewTabs';

const { dom, mount } = await installDom();
/**
 * A ResizeObserver the tests fire by hand (`resize`). As in a browser, only an observer watching
 * the element whose size changed is called, so a test proves which elements are watched.
 */
class HandResizeObserver {
  static live = new Set<HandResizeObserver>();
  readonly watched = new Set<Element>();
  constructor(private readonly callback: () => void) {}
  observe(el: Element): void {
    this.watched.add(el);
    HandResizeObserver.live.add(this);
  }
  disconnect(): void {
    HandResizeObserver.live.delete(this);
  }
  static resize(el: Element): void {
    for (const observer of HandResizeObserver.live)
      if (observer.watched.has(el)) observer.callback();
  }
}
const resizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: HandResizeObserver,
});
// Anything the tabs read past the seeded views (the attention queue) waits for ever.
globalThis.fetch = Object.assign(() => new Promise<Response>(() => undefined), {
  preconnect: globalThis.fetch.preconnect,
});

afterEach(() => {
  invalidate('factory-views');
  invalidate('runs');
});
afterAll(() => {
  if (resizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', resizeObserver);
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
});

const ID = 'cb-tabs';
const tabs = (active: 'runs' | 'factory') =>
  mount(
    <MemoryRouter>
      <ProjectAttentionProvider projectId={ID}>
        <ProjectViewTabs projectId={ID} active={active} />
      </ProjectAttentionProvider>
    </MemoryRouter>
  );

/**
 * happy-dom lays nothing out: a 390 px row whose tabs are `width` wide with 10 px between them,
 * for the length of `run`.
 */
async function withLayout(width: (tab: Element) => number, run: () => Promise<void>) {
  const proto = dom.HTMLElement.prototype;
  const stubbed = {
    clientWidth: () => 390,
    offsetWidth(this: HTMLElement) {
      return width(this);
    },
    offsetLeft(this: HTMLElement) {
      const parent = this.parentElement;
      if (parent === null) return 0;
      const before = [...parent.children].slice(0, [...parent.children].indexOf(this));
      return before.reduce((left, tab) => left + width(tab) + 10, 0);
    },
  };
  const originals = Object.keys(stubbed).map(
    key => [key, Object.getOwnPropertyDescriptor(proto, key)] as const
  );
  for (const [key, get] of Object.entries(stubbed))
    Object.defineProperty(proto, key, { configurable: true, get });
  try {
    await run();
  } finally {
    for (const [key, original] of originals)
      if (original) Object.defineProperty(proto, key, original);
      else Reflect.deleteProperty(proto, key);
  }
}

test('the project tabs, in order, with Factory once the views are read', async () => {
  set(K.factoryViews(ID), { views: [shippedListed], errors: [] });
  const page = await tabs('runs');
  expect([...page.container.querySelectorAll('a')].map(tab => tab.textContent)).toEqual([
    'Needs you',
    'Runs',
    'Chat',
    'Metrics',
    'Factory',
  ]);
  await page.unmount();
});

test('on a phone the active Factory tab, last in the row, is scrolled into view once it joins', async () => {
  // Each tab is 90 px: Factory sits at 400..490, so the row scrolls 100 px to show it whole.
  await withLayout(
    () => 90,
    async () => {
      const page = await tabs('factory');
      const row = page.container.querySelector<HTMLElement>('a')?.parentElement;
      expect(row?.scrollLeft).toBe(0);
      await act(async () => set(K.factoryViews(ID), { views: [shippedListed], errors: [] }));
      expect(row?.scrollLeft).toBe(100);
      await page.unmount();
    }
  );
});

test('a Needs-you badge widening a tab before the active one keeps the active tab in view', async () => {
  // A tab is 120 px with its waiting badge: Factory moves from 400..490 to 430..520.
  await withLayout(
    el => (el.querySelector('[aria-label$="waiting"]') ? 120 : 90),
    async () => {
      set(K.factoryViews(ID), { views: [shippedListed], errors: [] });
      set(K.projectAttention(ID), { items: [], runs: [], degraded: [] });
      const page = await tabs('factory');
      const row = page.container.querySelector<HTMLElement>('a')?.parentElement;
      expect(row?.scrollLeft).toBe(100);
      await act(async () =>
        set(K.projectAttention(ID), { items: [askItem()], runs: [], degraded: [] })
      );
      // Only the tab holding the badge changes size; the tabs after it move but keep theirs.
      const widened = page.container.querySelector('[aria-label$="waiting"]')?.closest('a');
      if (widened == null) throw new Error('No Needs-you badge');
      await act(async () => HandResizeObserver.resize(widened));
      expect(row?.scrollLeft).toBe(130);
      await page.unmount();
    }
  );
});
