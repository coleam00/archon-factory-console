import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import type { AttentionQueue } from '../skills/runs';
import { set } from '../store/cache';
import { K } from '../store/keys';
import { shippedView } from './item-detail.test-fixtures';
import { NeedsYouList } from './NeedsYouList';
import { askItem } from './needs-you.test-fixtures';

// Open and "show all" change what renders only after a click, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');

afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const asks = (count: number): AttentionQueue => ({
  items: Array.from({ length: count }, (_, i) =>
    askItem({
      ref: `ask:${i.toString()}`,
      message: `Question ${i.toString()}?`,
      pausedAt: `2026-11-1${i.toString()}T09:00:00.000Z`,
    })
  ),
  runs: [],
  degraded: [],
});

async function withList(queue: AttentionQueue, check: (root: HTMLElement) => Promise<void>) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  // No item has settled asks: the list under the open asks stays empty.
  set(K.factoryItems('cb-1'), { items: [], members: {} });
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <NeedsYouList
            projectId="cb-1"
            view={shippedView}
            attention={{ data: queue, error: undefined, loading: false, refetch: () => {} }}
          />
        </MemoryRouter>
      )
    );
    await check(container as unknown as HTMLElement);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

const button = (root: HTMLElement, text: string): HTMLButtonElement => {
  const found = [...root.querySelectorAll('button')].find(b => b.textContent === text);
  if (!found) throw new Error(`No button reading "${text}"`);
  return found;
};
const click = async (target: HTMLButtonElement): Promise<void> => {
  await act(async () => target.click());
};

test('Open shows the answer form in place, recommended option first; Close hides it', async () => {
  await withList(asks(1), async root => {
    expect(root.textContent).not.toContain('Use dev (recommended)');
    await click(button(root, 'Open'));
    const answers = [...root.querySelectorAll('button')].map(b => b.textContent);
    expect(answers.indexOf('Use dev (recommended)')).toBeGreaterThanOrEqual(0);
    expect(answers.indexOf('Use dev (recommended)')).toBeLessThan(answers.indexOf('Use main'));
    await click(button(root, 'Close'));
    expect(root.textContent).not.toContain('Use dev (recommended)');
  });
});

test('show all lists the asks past the fourth; Show fewer hides them again', async () => {
  await withList(asks(6), async root => {
    expect(root.textContent).not.toContain('Question 1?');
    await click(button(root, '2 more · show all 6'));
    expect(root.textContent).toContain('Question 1?');
    expect(root.textContent).toContain('Question 0?');
    await click(button(root, 'Show fewer'));
    expect(root.textContent).not.toContain('Question 1?');
    expect(root.textContent).toContain('2 more · show all 6');
  });
});
