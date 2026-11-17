import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { endedWith, itemWith, realItem, softwareFactory } from '../lib/map.test-fixtures';
import { askItem } from '../needs-you.test-fixtures';
import { FactoryMap } from './FactoryMap';

// Selecting a card and opening its stage need clicks, which static markup cannot reach.
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
afterEach(() => invalidate('factory-items'));

const ID = 'cb-1';
const asking = itemWith('9', endedWith('deliver', 'completed', 'ask'));
const items = [realItem('5'), realItem('8'), realItem('7'), asking];
const queue: AttentionQueue = {
  items: [askItem({ item: { id: asking.item.id, projectKey: 'acme', key: '9' } })],
  runs: [],
  degraded: [],
};
const attention: EntityView<AttentionQueue> = {
  data: queue,
  error: undefined,
  loading: false,
  refetch: () => undefined,
};

function StagePage(): React.ReactElement {
  return <p data-testid="stage-page">{useParams().stage}</p>;
}

async function mount(): Promise<{ container: HTMLElement; unmount: () => Promise<void> }> {
  set(K.factoryItems(ID), items);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory`]}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory"
            element={<FactoryMap projectId={ID} view={softwareFactory} attention={attention} />}
          />
          <Route path="/console/p/:projectId/factory/stages/:stage" element={<StagePage />} />
        </Routes>
      </MemoryRouter>
    )
  );
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const card = (container: HTMLElement, stage: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`[data-stage="${stage}"] button`);
  if (button === null) throw new Error(`No card for ${stage}`);
  return button;
};

test('every card shows its chips; a click opens its details with the items there', async () => {
  const { container, unmount } = await mount();
  try {
    expect(card(container, 'build').getAttribute('aria-label')).toBe(
      'Build: 2 here, 1 being worked, 1 needs you'
    );
    expect(card(container, 'checks').getAttribute('aria-label')).toBe(
      'Checks: 1 here, 1 being worked'
    );
    expect(card(container, 'landed').getAttribute('aria-label')).toBe('Landed: 1 here');

    // A keyboard click (detail 0) selects at once.
    await act(async () => card(container, 'build').click());
    const panel = container.querySelector('aside[aria-label="Build details"]');
    const links = [...(panel?.querySelectorAll('li a') ?? [])].map(link =>
      link.getAttribute('href')
    );
    expect(links).toEqual([
      `/console/p/${ID}/factory/items/5`,
      `/console/p/${ID}/factory/items/9`,
      `/console/p/${ID}/factory/stages/build`,
    ]);
    expect(panel?.textContent).toContain('Needs you');
    expect(panel?.textContent).toContain('deliver · build__build');
  } finally {
    await unmount();
  }
});

test('a double-click opens the stage page', async () => {
  const { container, unmount } = await mount();
  try {
    await act(async () => {
      card(container, 'checks').dispatchEvent(
        new dom.MouseEvent('dblclick', { bubbles: true }) as unknown as Event
      );
    });
    expect(container.querySelector('[data-testid="stage-page"]')?.textContent).toBe('checks');
  } finally {
    await unmount();
  }
});
