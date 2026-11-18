import { afterAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { BoardCard } from './BoardCard';
import { itemDetail, PROJECT, shippedView } from './item-detail.test-fixtures';
import { ItemTimeline } from './ItemTimeline';
import { cardFields } from './lib/board';
import { VIEW, realItem } from './lib/board.test-fixtures';
import { EMPTY_STAGE_LIVE } from './lib/map-live';
import { layoutMap } from './lib/map-layout';
import { stageHoldsShadow, type ShadowDecision } from './lib/shadows';
import { buildTimeline } from './lib/timeline';
import { MapCard } from './map/MapCard';
import { DrilldownCard } from './stage/DrilldownCard';
import type { BoardAsks } from './useBoardAsks';

// The timeline's disclosure is a click, which static markup cannot reach.
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

async function render(element: ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter>{element}</MemoryRouter>);
  });
  return container as unknown as HTMLElement;
}

/**
 * Rule 10: nothing a shadow did wears the running, success, warning or error colour, as a
 * token or as the utility that draws it.
 */
const STATE_COLOUR =
  /--(running|success|warning|error)\b|\b(text|bg|border)-(success|warning|error)\b/;

const at = '2026-11-18T12:00:00.000Z';
const failedChecks: ShadowDecision = {
  workflow: 'deliver',
  node: 'rounds.checks',
  round: 1,
  runId: 'r',
  decidedAt: at,
  read: {
    reads: 'checks',
    results: [
      { name: 'type-check', passed: false, seconds: 167, tail: 'exited with code 1' },
      { name: 'format', passed: true, seconds: 2, tail: null },
    ],
  },
};
const askedGate: ShadowDecision = {
  workflow: 'landgate',
  node: 'gate',
  round: null,
  runId: 'g',
  decidedAt: at,
  read: { reads: 'verdict', value: 'ask', why: 'Nothing shows the operator looked at it.' },
};

describe("the item's timeline", () => {
  test('each decision under its run: the badge, the label and round, what it would do', async () => {
    const detail = itemDetail('1');
    const deliver = detail.runs[2];
    if (deliver === undefined) throw new Error('item 1 has a deliver run');
    deliver.shadows = [{ ...failedChecks, runId: deliver.runId }];
    const rows = buildTimeline(shippedView, PROJECT, detail, Date.parse(at));
    const page = await render(<ItemTimeline rows={rows} />);
    const runs = [...page.querySelectorAll('ol > li')].filter(li => li.querySelector('a') !== null);
    expect(runs[2]?.querySelector('[data-shadow]')).not.toBeNull();
    expect(runs[0]?.querySelector('[data-shadow]')).toBeNull();
    const row = page.querySelector('[data-shadow]');
    expect(row?.textContent).toContain('shadow');
    expect(row?.textContent).toContain('Project checks · round 1');
    expect(row?.textContent).toContain('2 checks · 1 failed: type-check · 2 min');
    // The failed check's output opens on demand.
    expect(row?.textContent).not.toContain('exited with code 1');
    const why = row?.querySelector('button');
    await act(async () => {
      why?.dispatchEvent(new dom.MouseEvent('click', { bubbles: true }) as unknown as Event);
    });
    expect(row?.textContent).toContain('exited with code 1');
    expect(row?.outerHTML).not.toMatch(STATE_COLOUR);
  });
});

describe('a stage page card standing for a shadow step', () => {
  const card = shippedView.stages
    .find(stage => stage.id === 'checks')
    ?.drilldown?.phases.flatMap(phase => phase.cards)
    .find(entry => entry.title === 'Project checks');
  if (card === undefined) throw new Error('the shipped checks stage has a Project checks card');

  test('carries the badge, the shadow accent and what it decided lately', async () => {
    const page = await render(
      <DrilldownCard
        view={shippedView}
        projectId={PROJECT}
        card={card}
        onCard={[]}
        selected={false}
        onSelect={() => undefined}
        shadow={{ lately: ['last 5: all passed ×4 · 1 failed ×1'] }}
      />
    );
    const article = page.querySelector('article');
    expect(article?.querySelector('[data-shadow-badge]')).not.toBeNull();
    expect(article?.querySelector('[aria-hidden="true"]')?.getAttribute('style')).toContain(
      'var(--node-opaque)'
    );
    expect(article?.textContent).toContain('last 5: all passed ×4 · 1 failed ×1');
    expect(article?.outerHTML).not.toMatch(STATE_COLOUR);
  });

  test('a card standing for no shadow step has neither', async () => {
    const page = await render(
      <DrilldownCard
        view={shippedView}
        projectId={PROJECT}
        card={{ ...card, title: 'Code review' }}
        onCard={[]}
        selected={false}
        onSelect={() => undefined}
        shadow={null}
      />
    );
    expect(page.querySelector('[data-shadow-badge]')).toBeNull();
    expect(page.innerHTML).not.toContain('--node-opaque');
  });
});

describe('a board card in Ready to merge', () => {
  test('one line: what the land gate would do, in the shadow style', async () => {
    // Any real item: the line reads only its progress and the stage it is placed in.
    const item = realItem('1');
    if (item.progress === null) throw new Error('fixture item 1 has progress');
    item.progress.running = null;
    item.progress.shadows = [askedGate];
    const ready = VIEW.stages.find(stage => stage.id === 'ready');
    if (ready === undefined) throw new Error('the shipped view has a ready stage');
    const fields = cardFields(VIEW, PROJECT, item, { stage: ready });
    const asks: BoardAsks = {
      asksOf: () => [],
      faceOf: () => null,
      answeredLine: () => null,
      open: null,
      openFor: () => undefined,
      close: () => undefined,
      settle: () => undefined,
    };
    const page = await render(
      <BoardCard
        projectId={PROJECT}
        card={fields}
        moved={false}
        accent="var(--node-script)"
        asks={asks}
      />
    );
    const line = page.querySelector('[data-shadow-line]');
    expect(line?.textContent).toBe('shadowwould ask you first');
    expect(line?.getAttribute('title')).toBe('Nothing shows the operator looked at it.');
    expect(line?.outerHTML).not.toMatch(STATE_COLOUR);
  });
});

describe('the map', () => {
  const layout = layoutMap(shippedView);

  test('a card holding a shadow step carries the badge; others do not; no arrow is added', async () => {
    const marked: string[] = [];
    for (const card of layout.cards) {
      const stages = card.stages.flatMap(id => shippedView.stages.filter(stage => stage.id === id));
      const page = await render(
        <MapCard
          card={card}
          stages={stages}
          live={() => EMPTY_STAGE_LIVE}
          selected={false}
          stagePath={stage => `/s/${stage}`}
          onDetails={() => undefined}
          shadow={stages.some(stage => stageHoldsShadow(stage, shippedView))}
        />
      );
      if (page.querySelector('[data-shadow-badge]') !== null) marked.push(card.id);
    }
    expect(marked).toEqual(['intake', 'checks-review', 'ready']);
    // The map's lines are the declared arrows only: declaring shadows changes none of them.
    expect(layout).toEqual(layoutMap({ ...shippedView, shadows: undefined }));
  });
});
