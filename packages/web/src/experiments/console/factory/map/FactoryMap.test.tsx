import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import type { FactoryItem } from '../../skills/factory';
import { shippedListed } from '../item-detail.test-fixtures';
import { itemWith, realItem, run } from '../lib/map.test-fixtures';
import { askItem } from '../needs-you.test-fixtures';
import { MAP_TEXT_PX } from '../lib/map-camera';
import { FactoryMap } from './FactoryMap';

// Opening a card's stage or its details needs clicks, which static markup cannot reach.
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
afterEach(() => {
  invalidate('factory-items');
});

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
            element={<FactoryMap projectId={ID} view={shippedListed} attention={attention} />}
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

/** The card itself: the link that fills it. */
const card = (container: HTMLElement, stage: string): HTMLAnchorElement => {
  const link = container.querySelector<HTMLAnchorElement>(`[data-stage="${stage}"] > a`);
  if (link === null) throw new Error(`No card for ${stage}`);
  return link;
};
/** The card's details button, beside its link. */
const details = (container: HTMLElement, stage: string): HTMLButtonElement => {
  const button = container.querySelector<HTMLButtonElement>(`[data-stage="${stage}"] > button`);
  if (button === null) throw new Error(`No details button for ${stage}`);
  return button;
};
const stagePage = (container: HTMLElement): string | null | undefined =>
  container.querySelector('[data-testid="stage-page"]')?.textContent;

test('every card shows its chips and links to its stage; its details button lists the items there', async () => {
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
    expect(card(container, 'build').getAttribute('href')).toBe(
      `/console/p/${ID}/factory/stages/build`
    );

    await act(async () => details(container, 'build').click());
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
    expect(panel?.textContent).toContain('Build · Writes the change');
  } finally {
    await unmount();
  }
});

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

test('a click on a card opens its stage page', async () => {
  const { container, unmount } = await mount();
  try {
    await act(async () => card(container, 'checks').click());
    expect(stagePage(container)).toBe('checks');
  } finally {
    await unmount();
  }
});

test('the details button opens and closes the panel and never leaves the map', async () => {
  const { container, unmount } = await mount();
  try {
    await act(async () => details(container, 'landed').click());
    expect(container.querySelector('aside[aria-label="Landed details"]')).not.toBeNull();
    expect(details(container, 'landed').getAttribute('aria-pressed')).toBe('true');
    expect(stagePage(container)).toBeUndefined();
    await act(async () => details(container, 'landed').click());
    expect(container.querySelector('aside')).toBeNull();
    expect(stagePage(container)).toBeUndefined();
  } finally {
    await unmount();
  }
});

test('a drag that ends on a card pans the map and does not open the card', async () => {
  const { container, unmount } = await mount();
  try {
    const target = card(container, 'build');
    const layer = (): string | null | undefined =>
      container.querySelector<HTMLElement>('[style*="scale("]')?.style.transform;
    const before = layer();
    const send = (event: Event): void => {
      target.dispatchEvent(event);
    };
    const pointer = (type: string, init: Record<string, number>): Event =>
      new dom.PointerEvent(type, { bubbles: true, cancelable: true, ...init }) as unknown as Event;
    await act(async () => {
      send(
        pointer('pointerdown', { button: 0, buttons: 1, pointerId: 1, clientX: 100, clientY: 100 })
      );
      send(pointer('pointermove', { buttons: 1, pointerId: 1, clientX: 140, clientY: 100 }));
      send(pointer('pointerup', { pointerId: 1, clientX: 140, clientY: 100 }));
      send(
        new dom.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          detail: 1,
        }) as unknown as Event
      );
    });
    expect(stagePage(container)).toBeUndefined();
    expect(layer()).not.toBe(before);
    // The guard lasts one task: the next click opens the card.
    await new Promise(resolve => setTimeout(resolve, 0));
    await act(async () => card(container, 'build').click());
    expect(stagePage(container)).toBe('build');
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

test("the map draws the view file's arrows and no others: forward ones labelled, send-backs in one lane", async () => {
  const { container, unmount } = await mount();
  try {
    const forward = [...container.querySelectorAll('g[data-arrow]:not([data-lane])')].map(
      g => g.textContent
    );
    expect(forward).toEqual([
      'ready',
      // Stacked one outcome per line in the narrow gap between two cards.
      'build,narrow',
      'planned',
      'built',
      'approved',
      'ready',
      'merged',
    ]);
    const lane = [...container.querySelectorAll('g[data-lane="feedback"]')];
    expect(lane.map(g => g.getAttribute('data-arrow'))).toEqual([
      'decl:7',
      'decl:8',
      'decl:9',
      'decl:10',
    ]);
    // Every arrow drawn is a declared one.
    expect(container.querySelectorAll('g[data-arrow]')).toHaveLength(
      shippedListed.declaration.map.arrows.length
    );
    const labels = [...container.querySelectorAll('g[data-lane-label]')].map(
      g => `${g.getAttribute('data-lane-label') ?? ''}: ${g.textContent ?? ''}`
    );
    expect(labels).toEqual(['build: returned', 'plan: replan, asks answered']);
  } finally {
    await unmount();
  }
});

/** The distinct tops of the cards when every element measures `width` wide. */
async function cardTopsAt(width: number): Promise<Set<string>> {
  const proto = dom.HTMLElement.prototype;
  const original = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get: () => width });
  const { container, unmount } = await mount();
  try {
    return new Set(
      [...container.querySelectorAll<HTMLElement>('[data-stage]')].map(el => el.style.top)
    );
  } finally {
    await unmount();
    if (original) Object.defineProperty(proto, 'clientWidth', original);
    else Reflect.deleteProperty(proto, 'clientWidth');
  }
}

test("the cards take one row in the Overview's 1100px row, and wrap to two in a phone's", async () => {
  expect((await cardTopsAt(1100)).size).toBe(1);
  expect((await cardTopsAt(358)).size).toBe(2);
});
