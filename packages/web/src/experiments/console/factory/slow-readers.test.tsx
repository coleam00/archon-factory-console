import { afterAll, afterEach, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { ProjectViewTabs } from '../components/ProjectViewTabs';
import { invalidate } from '../store/cache';
import { AnsweredLately } from './AnsweredLately';
import { isItemsRead, itemsReadAnswer } from './lib/fixtures/factory-items-page';
import { run, settledItem } from './lib/map.test-fixtures';
import { shippedListed, shippedView } from './item-detail.test-fixtures';

// Readers that show nothing while they wait: a missed deadline must still be retried (#39).
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
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  invalidate('factory-views');
  invalidate('factory-items');
});

afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-slow-readers';
/** Healthy but slow: every request answers after this, past the first 8 s deadline. */
const ANSWER_MS = 9_000;

/** A server whose every answer takes `ANSWER_MS`, unless the request is aborted first. */
function serveSlowly(answer: (url: string) => Response): void {
  globalThis.fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(answer(String(input)));
        }, ANSWER_MS);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      }),
    { preconnect: originalFetch.preconnect }
  );
}

/** Render `element`, then let 60 s pass a second at a time, so each settled read re-renders. */
async function renderFor60s(
  element: ReactElement
): Promise<{ text: string; done: () => Promise<void> }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>));
  for (let second = 0; second < 60; second += 1) {
    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });
  }
  return {
    text: container.textContent,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test('the project tabs show the Factory tab when the views read answers after the first deadline', async () => {
  jest.useFakeTimers();
  serveSlowly(() => Response.json({ views: [shippedListed], errors: [] }));
  const page = await renderFor60s(<ProjectViewTabs projectId={ID} active="runs" />);
  try {
    expect(page.text).toContain('Factory');
  } finally {
    await page.done();
  }
});

test('Answered lately shows when the items read answers after the first deadline', async () => {
  jest.useFakeTimers();
  const answered = settledItem(
    'p',
    run('plan', 'completed', 'ask'),
    '2026-11-17T10:00:00.000Z',
    run('plan', 'running', null, 'plan')
  );
  const items = itemsReadAnswer([answered]);
  serveSlowly(url =>
    isItemsRead(url) ? items(url) : Response.json({ error: 'not in this test' }, { status: 404 })
  );
  const page = await renderFor60s(<AnsweredLately projectId={ID} view={shippedView} />);
  try {
    expect(page.text).toContain('Answered lately');
    expect(page.text).toContain('#p');
  } finally {
    await page.done();
  }
});
