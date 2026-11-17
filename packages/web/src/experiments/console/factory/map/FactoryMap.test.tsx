import { afterAll, afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import type { FactoryItem } from '../../skills/factory';
import type { PackGraph } from '../../skills/packs';
import { shippedListed } from '../item-detail.test-fixtures';
import { DECLARED_GRAPH, LIVE_GRAPH } from '../lib/pack-graph.test-fixtures';
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
  invalidate('pack-graph');
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
  read: FactoryItem[] = items,
  graph: PackGraph | null = LIVE_GRAPH
): Promise<{ container: HTMLElement; unmount: () => Promise<void> }> {
  set(K.factoryItems(ID), read);
  if (graph !== null) set(K.packGraph(ID, shippedListed.packKey), graph);
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

test('hand-offs between workflows come from the pack graph, solid where the install starts them', async () => {
  const { container, unmount } = await mount();
  try {
    const drawn = [...container.querySelectorAll('g[data-arrow]')].map(
      g => `${g.textContent ?? ''} (${g.getAttribute('data-style') ?? ''})`
    );
    // The declared hand-offs inside deliver and into Landed, then the graph's.
    expect(drawn).toEqual([
      'built (solid)',
      'approved (solid)',
      'merged (solid)',
      'returned (solid)',
      'returned (solid)',
      'ready (solid)',
      // Stacked one outcome per line in the narrow gap between two cards.
      'build,narrow (solid)',
      'planned (solid)',
      'ready (solid)',
      'asks answered (solid)',
      'asks answered (solid)',
    ]);
    // The outcomes that start nothing end at a bar on their card.
    expect(container.querySelector('g[data-ends="triage"]')?.textContent).toContain('decline');
    expect(container.querySelector('g[data-ends="order"]')?.textContent).toBe('refused');
    expect(container.querySelector('g[data-ends="plan"]')).toBeNull();
    // A start of a workflow with no card is named under the map.
    expect(
      container.querySelector('ul[aria-label="Starts not on the map"]')?.textContent
    ).toContain('also starts discoveries, which has no card here');
    expect(container.textContent).not.toContain('Wirasm/archon-software-factory:');
  } finally {
    await unmount();
  }
});

test('an install that starts none of them draws every graph hand-off dashed, the declared ones solid', async () => {
  const { container, unmount } = await mount(items, DECLARED_GRAPH);
  try {
    const arrows = [...container.querySelectorAll('g[data-arrow]')];
    const graph = arrows.filter(g => g.getAttribute('data-arrow')?.startsWith('graph:'));
    const declared = arrows.filter(g => g.getAttribute('data-arrow')?.startsWith('decl:'));
    // Five hand-offs between cards, and the loop on Plan.
    expect(graph).toHaveLength(6);
    expect(declared).toHaveLength(shippedListed.declaration.map.arrows.length);
    const dashed = (g: Element): boolean =>
      g.querySelector('path')?.hasAttribute('stroke-dasharray') ?? false;
    for (const g of graph) {
      expect(g.getAttribute('data-style')).toBe('declared');
      expect(dashed(g)).toBe(true);
    }
    for (const g of declared) {
      expect(g.getAttribute('data-style')).toBe('solid');
      expect(dashed(g)).toBe(false);
    }
  } finally {
    await unmount();
  }
});

test('a pack graph that cannot be read leaves the declared arrows and says why', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(
    async () => Response.json({ error: 'No workflow pack was found' }, { status: 404 }),
    { preconnect: originalFetch.preconnect }
  );
  const { container, unmount } = await mount(items, null);
  try {
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'No workflow pack was found'
    );
    expect(container.querySelectorAll('g[data-arrow]')).toHaveLength(
      shippedListed.declaration.map.arrows.length
    );
  } finally {
    await unmount();
    globalThis.fetch = originalFetch;
  }
});
