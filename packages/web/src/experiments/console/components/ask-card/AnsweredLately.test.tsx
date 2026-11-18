import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { invalidate } from '../../store/cache';
import { AnsweredLately } from './AnsweredLately';

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

afterEach(() => {
  globalThis.fetch = originalFetch;
  invalidate('factory-items');
});
afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('while the history is unread, the empty state shows skeletons, never the never-asked sentence', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <AnsweredLately projectId="cb-unread" view={undefined} empty />
    </MemoryRouter>
  );
  expect(html).toContain('Nothing needs you right now.');
  expect(html).toContain('Loading what was answered lately');
  expect(html).toContain('motion-safe:animate-pulse');
  expect(html).not.toContain('appears here to answer');
  expect(html).not.toContain('Last asked');
});

test('a history read that fails says so in an alert, not the never-asked sentence', async () => {
  globalThis.fetch = Object.assign(
    async (): Promise<Response> => {
      throw new Error('the server is down');
    },
    { preconnect: originalFetch.preconnect }
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AnsweredLately projectId="cb-failing" view={undefined} empty />
        </MemoryRouter>
      )
    );
    for (let turn = 0; turn < 5 && container.querySelector('[role="alert"]') === null; turn++)
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    const alert = container.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain('What was answered lately could not be loaded');
    expect(alert).toContain('the server is down');
    expect(container.textContent).not.toContain('appears here to answer');
    expect(container.textContent).not.toContain('Loading what was answered lately');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
