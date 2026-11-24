import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { shippedListed } from '../factory/item-detail.test-fixtures';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { ProjectAttentionProvider } from './ProjectAttention';
import { ProjectViewTabs } from './ProjectViewTabs';

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
const globals = {
  window: dom,
  document: dom.document,
  EventSource: QuietEventSource,
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

test('on a phone the project tabs stay one line and scroll sideways, no tab squeezed', async () => {
  set(K.factoryViews(ID), { views: [shippedListed], errors: [] });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <ProjectAttentionProvider projectId={ID}>
            <ProjectViewTabs projectId={ID} active="runs" />
          </ProjectAttentionProvider>
        </MemoryRouter>
      )
    );
    const row = container.querySelector<HTMLElement>('a')?.parentElement;
    const classes = row?.className.split(' ') ?? [];
    expect(classes).toContain('flex-nowrap');
    expect(classes).toContain('overflow-x-auto');
    const tabs = [...container.querySelectorAll('a')];
    expect(tabs.map(tab => tab.textContent)).toEqual([
      'Needs you',
      'Runs',
      'Chat',
      'Metrics',
      'Factory',
    ]);
    for (const tab of tabs) {
      expect(tab.className).toContain('shrink-0');
      expect(tab.className).toContain('whitespace-nowrap');
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
