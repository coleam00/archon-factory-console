import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router';
import { invalidate } from '../store/cache';
import { shippedListed } from './item-detail.test-fixtures';
import { factoryRoutes } from './routes';

// The section's stream is opened by an effect, so this test mounts a live React tree.
const dom = new Window({ url: 'http://localhost' });

/** Every EventSource the pages open, by URL, and whether each was closed. */
const opened: { url: string; closed: boolean }[] = [];
class CountingEventSource {
  onmessage: unknown = null;
  onerror: unknown = null;
  readyState = 0;
  private readonly entry: { url: string; closed: boolean };
  constructor(url: string) {
    this.entry = { url, closed: false };
    opened.push(this.entry);
  }
  close(): void {
    this.readyState = 2;
    this.entry.closed = true;
  }
}
const globals = {
  window: dom,
  document: dom.document,
  EventSource: CountingEventSource,
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

afterAll(async () => {
  globalThis.fetch = originalFetch;
  invalidate('factory-views');
  invalidate('factory-workflow');
  invalidate('factory-items');
  invalidate('factory-item');
  invalidate('runs');
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-1';

// The pages only need a view to draw their frame; every other read may fail here.
globalThis.fetch = Object.assign(
  async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/factory/views'))
      return Response.json({ views: [shippedListed], errors: [] });
    if (url.includes('/api/runs/attention'))
      return Response.json({ items: [], runs: [], degraded: [] });
    return Response.json({ error: 'not in this test' }, { status: 404 });
  },
  { preconnect: originalFetch.preconnect }
);

const settle = (): Promise<void> => act(async () => new Promise(resolve => setTimeout(resolve, 0)));

let navigate: NavigateFunction | undefined;
function Navigator(): null {
  navigate = useNavigate();
  return null;
}

const attentionStreams = (): { url: string; closed: boolean }[] =>
  opened.filter(entry => entry.url.includes('/api/runs/attention/stream'));

test('the Factory section keeps one attention stream across its pages and closes it on leaving', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory`]}>
        <Navigator />
        <Routes>
          {factoryRoutes('/console/')}
          <Route path="/console/p/:projectId/chat" element={<p>chat</p>} />
        </Routes>
      </MemoryRouter>
    )
  );
  await settle();
  // The frame drew under a view, so the page reads the section's queue.
  expect(container.textContent).toContain(shippedListed.declaration.title);

  for (const rest of ['/board', '/items/39', '/stages/plan', '/steps/plan/plan', '']) {
    await act(async () => navigate?.(`/console/p/${ID}/factory${rest}`));
    await settle();
    expect(container.textContent).toContain(shippedListed.declaration.title);
  }
  expect(attentionStreams()).toEqual([
    { url: expect.stringContaining(`project=${ID}`) as unknown as string, closed: false },
  ]);

  await act(async () => navigate?.(`/console/p/${ID}/chat`));
  await settle();
  expect(container.textContent).toBe('chat');
  expect(attentionStreams()).toHaveLength(1);
  expect(attentionStreams()[0]?.closed).toBe(true);

  await act(async () => root.unmount());
  container.remove();
});
