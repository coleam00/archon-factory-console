import { afterEach, expect, jest, test } from 'bun:test';
import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { installDom } from '../test-dom.test-helpers';
import { ProjectAttentionProvider } from '../components/ProjectAttention';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { SLOW_READ_NOTICE } from './FactoryLoading';
import { FactoryMap } from './map/FactoryMap';
import { shippedGraph, shippedListed } from './item-detail.test-fixtures';
import { packGraphKey } from './usePackGraph';

// A reader past its deadline still draws what it can and says the read is slow (#39).
const { mount } = await installDom();
const originalFetch = globalThis.fetch;

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
  invalidate('factory-views');
  invalidate('factory-items');
  invalidate('factory-pack-graph');
});

/** A fetch that never answers, so every read waits, and gives up only when aborted. */
const neverAnswers = Object.assign(
  (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    }),
  { preconnect: originalFetch.preconnect }
);

const mountMap = (): ReturnType<typeof mount> =>
  mount(
    <MemoryRouter>
      <ProjectAttentionProvider projectId={ID}>
        <FactoryMap projectId={ID} view={shippedListed} />
      </ProjectAttentionProvider>
    </MemoryRouter>
  );

const ID = 'cb-slow-readers';
test('the map draws its cards while the items read misses its first deadline, and says the read is slow', async () => {
  jest.useFakeTimers();
  // Never answers within this test: the first deadline passes and the retry is still waiting.
  globalThis.fetch = neverAnswers;
  set(K.projectAttention(ID), { items: [], runs: [], degraded: [] });
  set(packGraphKey(ID, shippedListed.packKey), shippedGraph);
  const { container, unmount } = await mountMap();
  try {
    for (let second = 0; second < 9; second += 1)
      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
    expect(container.querySelectorAll('[data-stage]')).toHaveLength(
      shippedListed.declaration.map.cards.length
    );
    expect(container.querySelector('[data-chip="here"]')).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe(SLOW_READ_NOTICE);
  } finally {
    await unmount();
  }
});

test('while the pack graph is read the map shows its loading shape, never a map without arrows', async () => {
  // A cold graph read can take over a minute; it has no deadline, so it is still waiting.
  globalThis.fetch = neverAnswers;
  set(K.projectAttention(ID), { items: [], runs: [], degraded: [] });
  const { container, unmount } = await mountMap();
  try {
    expect(container.querySelector('[data-stage]')).toBeNull();
    expect(container.textContent).toContain('Loading the map');
    await act(async () => {
      set(packGraphKey(ID, shippedListed.packKey), shippedGraph);
    });
    expect(container.querySelectorAll('[data-stage]')).toHaveLength(
      shippedListed.declaration.map.cards.length
    );
  } finally {
    await unmount();
  }
});
