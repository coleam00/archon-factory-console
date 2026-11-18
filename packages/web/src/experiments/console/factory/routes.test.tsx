import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Routes, useLocation, useNavigationType } from 'react-router';
import { invalidate } from '../store/cache';
import { shippedListed } from './item-detail.test-fixtures';
import { projectRoutes } from '../routes/project-routes';

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
  invalidate('factory-overview');
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

/** Where the router is, and how it got there. */
function LocationProbe(): ReactElement {
  const { pathname, search } = useLocation();
  return <output data-at={pathname + search} data-by={useNavigationType()} />;
}

test('the old How it works address replaces itself with the new one, drill-down kept', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory/overview?view=checks`]}>
        <LocationProbe />
        <Routes>{projectRoutes('/console/')}</Routes>
      </MemoryRouter>
    )
  );
  await settle();
  const probe = container.querySelector('output');
  expect(probe?.getAttribute('data-at')).toBe(`/console/p/${ID}/factory/how-it-works?view=checks`);
  expect(probe?.getAttribute('data-by')).toBe('REPLACE');

  await act(async () => root.unmount());
  container.remove();
});

test('the old Needs you address replaces itself with the project tab, query and hash kept', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory/needs-you?x=1#h`]}>
        <HashProbe />
        <Routes>{projectRoutes('/console/')}</Routes>
      </MemoryRouter>
    )
  );
  await settle();
  const probe = container.querySelector('output');
  expect(probe?.getAttribute('data-at')).toBe(`/console/p/${ID}/needs-you?x=1#h`);
  expect(probe?.getAttribute('data-by')).toBe('REPLACE');
  // It lands on the tab's page, outside the Factory frame.
  expect(container.textContent).toContain('0 things need you');

  await act(async () => root.unmount());
  container.remove();
});

/** Where the router is, hash included, and how it got there. */
function HashProbe(): ReactElement {
  const { pathname, search, hash } = useLocation();
  return <output data-at={pathname + search + hash} data-by={useNavigationType()} />;
}
