import { afterAll, expect, test } from 'bun:test';
import { act } from 'react';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryViews } from './api';
import { invalidate, set } from '../store/cache';
import { FK } from './keys';
import { factoryRoutes } from './routes';
import { installDom } from './test-dom.test-helpers';
import { checksDrilldown } from './lib/fixtures/checks-drilldown';
import {
  capturedItemAs,
  capturedItemsPage,
  isItemsRead,
  itemsReadAnswer,
} from './lib/fixtures/factory-items-page';
import type { PackGraph } from './lib/graph-structure';
import { packGraphKey } from './usePackGraph';

// Opening a stage and the tabs are clicks, and static markup cannot click.
const { mount, settle } = await installDom();
afterAll(() => {
  for (const key of ['factory-views', 'factory-pack-graph', 'runs:factory-items', 'runs'])
    invalidate(key);
});

const ID = 'cb-1';
const STEPS = ['build__build', 'rounds', 'rounds.review__review', 'rounds.fix'];
/** The pack graph: `deliver` and its steps, in the graph's order. */
const graph = {
  pack: 'acme.kit',
  loaded: [],
  otherCopies: [],
  stages: [
    {
      // The run name the fixtures' runs record.
      name: 'Wirasm/archon-software-factory:deliver',
      returns: 'rounds',
      outcome: null,
      asks: false,
      nodes: STEPS.map(id => ({
        id,
        kind: 'prompt',
        dependsOn: [],
        loopGroup: id.startsWith('rounds.') ? 'rounds' : null,
        blocks: [],
        fanOut: null,
      })),
    },
  ],
  arrows: [],
  fanOutBlocks: [],
  discoveryErrors: [],
} satisfies PackGraph;
const views: FactoryViews = {
  views: [
    {
      pack: 'acme/kit',
      packKey: 'acme.kit',
      runNames: { deliver: 'Wirasm/archon-software-factory:deliver' },
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-view.json',
      declaration: {
        version: 1,
        pack: 'acme/kit',
        title: 'Kit factory',
        summary: 'Issues come in; changes go out.',
        stages: [
          // No drill-down: its modal opens on the real workflow's steps.
          { id: 'build', label: 'Build', blurb: 'Builds.', group: 'build', workflows: ['deliver'] },
          {
            id: 'checks',
            label: 'Checks',
            blurb: 'Checks the change.',
            group: 'check',
            workflows: ['deliver'],
            drilldown: checksDrilldown,
          },
        ],
        placement: {},
        endings: {},
        landed: { stage: 'checks' },
        steps: { deliver: { 'rounds.review__review': 'Reviews the change' } },
        map: { cards: [], arrows: [] },
      },
    },
  ],
  errors: [],
};

function serve(items: (url: string) => Response): void {
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/factory/views')) return Response.json(views);
      if (isItemsRead(url)) return items(url);
      if (url.includes('/api/runs/attention'))
        return Response.json({ items: [], runs: [], degraded: [] });
      return Response.json({ error: 'not in this test' }, { status: 404 });
    },
    { preconnect: fetch.preconnect }
  );
  set(FK.factoryViews(ID), views);
  set(packGraphKey(ID, 'acme.kit'), graph);
  // Each test starts from a cold items read, so it loads what this test serves.
  invalidate('runs:factory-items');
}

async function renderAt(path: string, check: (body: HTMLElement) => Promise<void>): Promise<void> {
  const mounted = await mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{factoryRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
  try {
    await settle();
    // The stage modal portals to the body, outside the root.
    await check(document.body as unknown as HTMLElement);
  } finally {
    await mounted.unmount();
  }
}

const click = async (target: Element | null | undefined): Promise<void> => {
  await act(async () => {
    (target as HTMLElement | null)?.click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
};
/** The real workflow's steps as the stage lists them, by engine id. */
const listedSteps = (body: HTMLElement): Element[] => [...body.querySelectorAll('[data-step]')];
const phaseLabels = (root: Element): string[] =>
  [...root.querySelectorAll('[data-phase]')].map(phase => phase.getAttribute('aria-label') ?? '');
const liveCards = (body: HTMLElement): string[] =>
  [...body.querySelectorAll('article[data-live]')].map(c => c.textContent ?? '');
const card = (body: HTMLElement, text: string): Element => {
  const found = [...body.querySelectorAll('article')].find(a => a.textContent.includes(text));
  if (!found) throw new Error(`No card reads ${text}`);
  return found;
};
const on = (key: string, step: string) =>
  capturedItemAs(key, {
    running: { runId: `run-${key}`, workflow: 'deliver', step, startedAt: '2026-11-17T07:00:00Z' },
  });

// Newest activity first: #4's run started after #12's.
const capturedLinks = ['4', '12', '6'].map(key => `/console/p/${ID}/factory/items/${key}`);

test('a stage with no drill-down lists the pack graph steps as text, the running one naming its items', async () => {
  serve(itemsReadAnswer(capturedItemsPage.items));
  await renderAt(`/console/p/${ID}/factory?stage=build`, async body => {
    const selected = body.querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toBe('The real workflow');
    expect(body.textContent).toContain('Running now');
    expect(listedSteps(body).map(step => step.getAttribute('data-step'))).toEqual(STEPS);
    const build = listedSteps(body)[0];
    expect(build?.hasAttribute('data-running')).toBe(true);
    expect(
      [...(build?.querySelectorAll('a[href*="/factory/items/"]') ?? [])].map(a =>
        a.getAttribute('href')
      )
    ).toEqual(capturedLinks);
    expect(listedSteps(body)[3]?.hasAttribute('data-running')).toBe(false);
    // A step is plain text: there is no step page to open.
    expect(body.querySelector('a[href*="/factory/steps/"]')).toBeNull();
  });
});

test('the drill-down tells numbered phases of cards in one loop; a card glows and links its items', async () => {
  serve(itemsReadAnswer([on('7', 'rounds.review__review')]));
  await renderAt(`/console/p/${ID}/factory?stage=checks`, async body => {
    expect(phaseLabels(body)).toEqual([
      'Phase 1: Prepare',
      'Phase 2: Check',
      'Phase 3: Verdict',
      'Phase 4: Out of rounds',
    ]);
    expect(body.querySelectorAll('article')).toHaveLength(7);
    const loops = [...body.querySelectorAll('[data-loop]')];
    expect(loops).toHaveLength(1);
    expect(loops[0]?.textContent).toContain('Up to 3 rounds');
    expect(phaseLabels(loops[0]!)).toEqual([
      'Phase 1: Prepare',
      'Phase 2: Check',
      'Phase 3: Verdict',
    ]);
    expect(liveCards(body)).toEqual([expect.stringContaining('Code review')]);
    const lit = body.querySelector('article[data-live]');
    expect(lit?.hasAttribute('data-running')).toBe(true);
    // The card is plain text: its only links are the items on it.
    expect([...(lit?.querySelectorAll('a') ?? [])].map(a => a.getAttribute('href'))).toEqual([
      `/console/p/${ID}/factory/items/7`,
    ]);
    expect(card(body, 'Code review').textContent).toContain(
      "Reads the change for bugs and the project's rules"
    );
  });
});

test('the stage modal tabs switch between the phases, the items and the real steps', async () => {
  serve(itemsReadAnswer([]));
  await renderAt(`/console/p/${ID}/factory?stage=checks`, async body => {
    const graphStep = () => listedSteps(body)[0];
    const tab = (name: string) =>
      [...body.querySelectorAll('[role="tab"]')].find(candidate => candidate.textContent === name);
    expect(phaseLabels(body)).toHaveLength(4);
    expect(graphStep()).toBeUndefined();
    await click(tab('The real workflow'));
    expect(graphStep()).toBeDefined();
    expect(phaseLabels(body)).toHaveLength(0);
    await click(tab('Items here now'));
    expect(body.textContent).toContain('Nothing is in this stage now.');
    await click(tab('What this stage does'));
    expect(phaseLabels(body)).toHaveLength(4);
  });
});
