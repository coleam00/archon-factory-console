import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import type { FactoryItem } from '../../skills/factory';
import { shippedView } from '../item-detail.test-fixtures';
import { itemWith, realItem, run } from '../lib/map.test-fixtures';
import { askItem } from '../needs-you.test-fixtures';
import { MAP_TEXT_PX } from '../lib/map-camera';
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
const asking = itemWith('9', [run('deliver', 'completed', 'ask')]);
const items = [realItem('5'), realItem('4'), realItem('7'), asking];
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

async function mount(
  read: FactoryItem[] = items
): Promise<{ container: HTMLElement; unmount: () => Promise<void> }> {
  set(K.factoryItems(ID), read);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/console/p/${ID}/factory`]}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory"
            element={<FactoryMap projectId={ID} view={shippedView} attention={attention} />}
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
    // What a person sees: the chips drawn on the card, by count.
    const chip = (stage: string, kind: string): string | null | undefined =>
      container.querySelector(`[data-stage="${stage}"] [data-chip="${kind}"]`)?.textContent;
    expect(chip('build', 'here')).toContain('2');
    expect(chip('build', 'need-you')).toContain('1');
    expect(chip('checks', 'here')).toContain('1');
    expect(chip('checks', 'need-you')).toBeUndefined();
    expect(chip('plan', 'here')).toBeUndefined();
    // The open icon leads to the stage page.
    expect(container.querySelector('a[aria-label="Open Build"]')?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/stages/build`
    );

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

/** A click with click count `detail`, at the screen point `at` (where the pointer was). */
const clickOf = (target: Element, detail: number, at = { x: 0, y: 0 }): Promise<void> =>
  act(async () => {
    target.dispatchEvent(
      new dom.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail,
        clientX: at.x,
        clientY: at.y,
      }) as unknown as Event
    );
  });
const stagePage = (container: HTMLElement): string | null | undefined =>
  container.querySelector('[data-testid="stage-page"]')?.textContent;

test('no text the camera scales is smaller than MAP_TEXT_PX, which the readable scale assumes', async () => {
  const { container, unmount } = await mount();
  try {
    const layer = container.querySelector('[style*="scale("]');
    if (layer === null) throw new Error('The map layer was not rendered');
    const sizes = [...layer.querySelectorAll('[class*="text-console-"]')].flatMap(el =>
      [...el.getAttribute('class')!.matchAll(/text-console-(\d+)/g)].map(m => Number(m[1]))
    );
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MAP_TEXT_PX);
  } finally {
    await unmount();
  }
});

test('a double-click on a card opens its stage page', async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'checks'), 1);
    await clickOf(card(container, 'checks'), 2);
    expect(stagePage(container)).toBe('checks');
  } finally {
    await unmount();
  }
});

test("a double-click whose second click lands in the opened panel opens the first click's stage", async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'landed'), 1);
    const itemLink = container.querySelector('aside[aria-label="Landed details"] li a');
    if (itemLink === null) throw new Error('The panel did not open on the first click');
    await clickOf(itemLink, 2);
    expect(stagePage(container)).toBe('landed');
  } finally {
    await unmount();
  }
});

test('a lone second click on a card, as a synthesised double-click sends, opens that card', async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'plan'), 2);
    expect(stagePage(container)).toBe('plan');
  } finally {
    await unmount();
  }
});

test('a lone second click after an earlier single click elsewhere opens the card under it', async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'plan'), 1, { x: 300, y: 500 });
    await clickOf(card(container, 'build'), 2, { x: 450, y: 500 });
    expect(stagePage(container)).toBe('build');
  } finally {
    await unmount();
  }
});

test('a click, Escape, then a double-click elsewhere opens the card double-clicked', async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'landed'), 1, { x: 1300, y: 500 });
    await act(async () => {
      window.dispatchEvent(new dom.KeyboardEvent('keydown', { key: 'Escape' }) as unknown as Event);
    });
    expect(container.querySelector('aside')).toBeNull();
    await clickOf(card(container, 'checks'), 2, { x: 700, y: 500 });
    expect(stagePage(container)).toBe('checks');
  } finally {
    await unmount();
  }
});

test('two single clicks select, and never open a stage', async () => {
  const { container, unmount } = await mount();
  try {
    await clickOf(card(container, 'landed'), 1);
    await clickOf(card(container, 'build'), 1);
    expect(stagePage(container)).toBeUndefined();
    expect(container.querySelector('aside[aria-label="Build details"]')).not.toBeNull();
  } finally {
    await unmount();
  }
});

/** Item 4, whose deliver run is in its checks, with its running step set to `step`. */
function checking(step: string | null): FactoryItem {
  const item = realItem('4');
  const progress = item.progress;
  if (progress === null || progress.running === null) throw new Error('item 4 is running');
  return { ...item, progress: { ...progress, running: { ...progress.running, step } } };
}

/** The "N here" chip a card draws; null when it draws none (nothing there). */
const hereChip = (container: HTMLElement, stage: string): string | null =>
  container.querySelector(`[data-stage="${stage}"] [data-chip="here"]`)?.textContent ?? null;

test('a later read on a step no stage names keeps the card where the last read put it, as the board does', async () => {
  const { container, unmount } = await mount([checking('rounds.tests__tests')]);
  try {
    expect(hereChip(container, 'checks')).toContain('1');
    // Between rounds the run records only the bare loop group, which no stage names.
    await act(async () => set(K.factoryItems(ID), [checking('rounds')]));
    expect(hereChip(container, 'checks')).toContain('1');
    expect(hereChip(container, 'build')).toBeNull();
  } finally {
    await unmount();
  }
});
