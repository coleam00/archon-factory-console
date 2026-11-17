import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { invalidate } from '../store/cache';
import { FactoryNumbers } from './FactoryNumbers';
import { VIEW } from './lib/board.test-fixtures';

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
globalThis.fetch = Object.assign(
  async (): Promise<Response> => {
    throw new Error('the server is down');
  },
  { preconnect: originalFetch.preconnect }
);

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
