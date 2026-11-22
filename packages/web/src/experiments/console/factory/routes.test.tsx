import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { invalidate } from '../store/cache';
import { K } from '../store/keys';
import { shippedListed } from './item-detail.test-fixtures';
import { consoleRoutes } from '../routes/console-routes';

// `renderToStaticMarkup` never follows a `<Navigate>`, so the redirect needs a live tree.
const dom = new Window({ url: 'http://localhost' });

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

afterAll(async () => {
  globalThis.fetch = originalFetch;
  invalidate('factory-views');
  invalidate(K.factoryPacks);
  invalidate('project');
  invalidate('runs');
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-1';

// The frame only needs a view; every other read may fail here.
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

let unmount: (() => Promise<void>) | undefined;
// Unmount after every test, failed or not, so a tree left mounted cannot break the next file.
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
});

/** The console's own route list at `at`, under `/console/*` as the app mounts it. */
async function mountConsole(at: string): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <HashProbe />
        <Routes>
          <Route path="/console/*" element={<Routes>{consoleRoutes()}</Routes>} />
        </Routes>
      </MemoryRouter>
    )
  );
  await settle();
  return container;
}

for (const old of ['how-it-works', 'overview'])
  test(`the project's factory/${old} replaces itself with its pack's sidebar page, drill-down kept`, async () => {
    const page = await mountConsole(`/console/p/${ID}/factory/${old}?view=checks#top`);
    const probe = page.querySelector('output');
    // One hop, by the key the views read lists for the view's pack, to a route the console has.
    expect(probe?.getAttribute('data-at')).toBe(
      `/console/factory/${shippedListed.packKey}/how-it-works?view=checks#top`
    );
    expect(probe?.getAttribute('data-by')).toBe('REPLACE');
  });

test('the old Needs you address replaces itself with the project tab, query and hash kept', async () => {
  const page = await mountConsole(`/console/p/${ID}/factory/needs-you?x=1#h`);
  const probe = page.querySelector('output');
  expect(probe?.getAttribute('data-at')).toBe(`/console/p/${ID}/needs-you?x=1#h`);
  expect(probe?.getAttribute('data-by')).toBe('REPLACE');
  // It lands on the tab's page, outside the Factory frame.
  expect(page.textContent).toContain('Nothing needs you');
});

/** Where the router is, hash included, and how it got there. */
function HashProbe(): ReactElement {
  const { pathname, search, hash } = useLocation();
  return <output data-at={pathname + search + hash} data-by={useNavigationType()} />;
}
