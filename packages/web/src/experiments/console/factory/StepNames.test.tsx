/**
 * No raw engine step id where a person reads (DESIGN.md, "Step names, everywhere a person
 * reads"): each page's words and accessible names are scanned for an id's shape over fixtures
 * full of loop bodies, includes and failed steps. `title` and `href` may hold the raw id.
 */
import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from 'bun:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryItem, FactoryItemDetail, FactoryViews } from './api';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FK } from './keys';
import { factoryTestRoutes } from './test-routes';
import {
  itemDetail,
  shippedArrows,
  shippedGraph,
  shippedListed,
} from './item-detail.test-fixtures';
import { FIXTURE_NOW, delivering, endLastRun, realItem, VIEW } from './lib/board.test-fixtures';
import { EMPTY_STAGE_LIVE } from './lib/map-live';
import { StageView, useStageTab } from './stage/StageView';
import { attentionRead } from './lib/attention.test-fixtures';
import { packGraphKey, type MapStructure } from './usePackGraph';

// The board sets aside items idle past a line counted from now, so the fixtures' items are read
// at the time they were copied, never at the day the test runs.
beforeAll(() => {
  setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  setSystemTime();
});

const ID = 'cb-1';
const listing: FactoryViews = {
  views: [{ ...shippedListed, declaration: VIEW }],
  errors: [],
};
const quiet = attentionRead();

afterEach(() => {
  for (const kind of [
    'factory-views',
    'factory-pack-graph',
    'runs:factory-items',
    'project',
    'runs',
  ])
    invalidate(kind);
});

/** Item 8 delivering `step`, under its own key so several can sit on one board. */
function on(step: string, key: string): FactoryItem {
  const item = delivering(step);
  return { ...item, item: { ...item.item, id: `id-${key}`, key } };
}

const ITEMS: FactoryItem[] = [
  on('rounds.review__review', '8'),
  on('hostrounds.host__host', '81'),
  on('rounds.mystery__mystery', '82'),
  on('build__build', '83'),
  endLastRun(realItem('3'), 'failed', null, 'rounds.tests__tests'),
];

/** The shipped view with no drill-downs, so a stage opens on its steps (a drill-down puts them behind a tab). */
const stepsListing: FactoryViews = {
  ...listing,
  views: [
    {
      ...shippedListed,
      declaration: {
        ...shippedListed.declaration,
        stages: shippedListed.declaration.stages.map(
          ({ drilldown: _drilldown, ...stage }) => stage
        ),
      },
    },
  ],
};

/** The shipped pack graph, read. */
const structure: MapStructure = {
  graph: { data: shippedGraph, error: undefined, loading: false, refetch: () => undefined },
  runNames: shippedListed.runNames,
  arrows: shippedArrows,
  failed: undefined,
  retry: () => undefined,
};

function seed(views: FactoryViews, detail?: FactoryItemDetail): void {
  set(FK.factoryViews(ID), views);
  set(K.runsAttention, quiet);
  set(packGraphKey(ID, shippedListed.packKey), shippedGraph);
  set(FK.factoryItems(ID), { items: ITEMS, members: {} });
  if (detail !== undefined) set(FK.factoryItem(ID, detail.item.item.key), detail);
}

function render(path: string, detail?: FactoryItemDetail, views = listing): string {
  seed(views, detail);
  return markup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{factoryTestRoutes()}</Routes>
    </MemoryRouter>
  );
}

/** A stage on the tab it opens on, as its modal draws it; the modal portals, which static markup cannot reach. */
function renderStage(stageId: string, views = listing): string {
  seed(views);
  const view = views.views[0]!.declaration;
  const stage = view.stages.find(candidate => candidate.id === stageId)!;
  function Stage(): ReactElement {
    const [tab, setTab] = useStageTab(stage);
    return (
      <StageView
        projectId={ID}
        view={view}
        structure={structure}
        stage={stage}
        live={EMPTY_STAGE_LIVE}
        tab={tab}
        onTab={setTab}
        frame={({ head, body }) => (
          <>
            {head}
            {body}
          </>
        )}
      />
    );
  }
  return markup(
    <MemoryRouter>
      <Stage />
    </MemoryRouter>
  );
}

const markup = (element: ReactElement): string => renderToStaticMarkup(element);

/** What a person reads: the text between tags, and every accessible name. */
function readable(html: string): string {
  const names = [...html.matchAll(/aria-label="([^"]*)"/g)].map(match => match[1] ?? '');
  const words = html.replace(/<[^>]*>/g, ' ');
  return [words, ...names]
    .join(' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

/** The loop groups the fixtures' deliver runs record their body steps under. */
const LOOPS = ['rounds', 'hostrounds'];
const ID_SHAPES = [/[A-Za-z0-9]__[A-Za-z0-9]/, new RegExp(`\\b(${LOOPS.join('|')})\\.[a-z]`)];

function rawIds(html: string): string[] {
  const text = readable(html);
  return ID_SHAPES.flatMap(shape => {
    const global = new RegExp(shape.source, 'g');
    return [...text.matchAll(global)].map(match =>
      text.slice(Math.max(0, match.index - 30), match.index + 30)
    );
  });
}

/** Every `title` on the page: where the engine id belongs, on hover. */
const titles = (html: string): string[] =>
  [...html.matchAll(/ title="([^"]*)"/g)].map(match => match[1] ?? '');

describe('no raw step id where a person reads', () => {
  test('the Overview, the board and its Table view name steps, their engine ids on hover', () => {
    expect(rawIds(render(`/console/p/${ID}/factory`))).toEqual([]);
    const html = render(`/console/p/${ID}/factory/board`);
    // The retired deliver's steps have no names in the view: they read as cleaned ids.
    expect(html).toContain('Build · review');
    expect(html).toContain('failed at tests');
    expect(titles(html)).toContain('Build · review (engine id: rounds.review__review)');
    expect(rawIds(html)).toEqual([]);
    expect(rawIds(render(`/console/p/${ID}/factory/board?view=table`))).toEqual([]);
  });

  test('the item page and its rounds grid, the step id on hover', () => {
    const html = render(`/console/p/${ID}/factory/items/125`, itemDetail('125'));
    expect(titles(html).some(title => title.startsWith('tests__tests'))).toBe(true);
    expect(rawIds(html)).toEqual([]);
  });

  test("the stage modal's steps, each by its name, the engine id on hover", () => {
    const html = renderStage('checks', stepsListing);
    expect(html).toContain('title="Code review (engine id: review__review)');
    expect(rawIds(html)).toEqual([]);
  });
});
