import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { AttentionAnswerForm } from '../components/AttentionAnswerPanel';
import { get, set } from '../store/cache';
import { K } from '../store/keys';
import { answerByRef } from './NeedsYouRow';
import { askItem } from './needs-you.test-fixtures';

// A refusal shows after a click re-renders the form, which static markup cannot reach.
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

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("a refused answer shows the server's reason in the row, and the queue refreshes", async () => {
  const refusal = "Item 'ask:gone' is no longer open";
  globalThis.fetch = Object.assign(async () => Response.json({ error: refusal }, { status: 409 }), {
    preconnect: originalFetch.preconnect,
  });
  set(K.factoryAttention('cb-1'), { items: [], runs: [], degraded: [] });
  const ask = askItem({ ref: 'ask:gone' });

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(<AttentionAnswerForm wait={ask} submit={answerByRef(ask.ref)} />)
    );
    const button = [...container.querySelectorAll('button')].find(
      candidate => candidate.textContent === 'Use dev (recommended)'
    );
    if (!button) throw new Error('The recommended option was not rendered');
    await act(async () => {
      button.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(refusal);
    // No subscriber holds the key here, so the refresh drops the cached queue.
    expect(get(K.factoryAttention('cb-1'))).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
