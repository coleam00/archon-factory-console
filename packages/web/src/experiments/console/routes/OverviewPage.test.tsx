import { afterEach, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ItemPage, ItemRead, PackGraph } from '../skills/items';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { PackOverview, startOfToday, todayCounts } from './OverviewPage';

afterEach(() => {
  for (const prefix of ['board', 'pack-graph', 'pack-view']) invalidate(prefix);
});

/** An item standing at a run of `workflow`, as far as the overview reads one. */
function item(
  workflow: string,
  rest: { asked?: boolean; startedAt?: string; mergedAt?: string } = {}
): ItemRead {
  return {
    standing: { runId: 'r1', state: rest.asked ? 'waiting' : 'running' },
    runs: [
      {
        id: 'r1',
        pack: { key: 'flow', workflow },
        startedAt: rest.startedAt ?? '2026-11-01T00:00:00Z',
      },
    ],
    questions: rest.asked ? [{ kind: 'attention' }] : [],
    merged: rest.mergedAt === undefined ? null : { at: rest.mergedAt },
  } as unknown as ItemRead;
}

test('today counts the items first started today and the ones whose change merged today', () => {
  const since = '2026-11-24T00:00:00Z';
  const counts = todayCounts(
    {
      items: [
        item('plan', { startedAt: '2026-11-24T08:00:00Z' }),
        item('check', { startedAt: '2026-11-20T08:00:00Z', mergedAt: '2026-11-24T09:00:00Z' }),
        item('check', { startedAt: '2026-11-20T08:00:00Z', mergedAt: '2026-11-23T09:00:00Z' }),
      ],
    },
    since
  );
  expect(counts).toEqual({ entered: 1, landed: 1 });
});

test('the open asks come under the tiles and before the map', () => {
  const page: ItemPage = { items: [], next: null, totals: { done: 3 } } as unknown as ItemPage;
  set(K.packGraph('p1', 'flow'), {
    stages: [],
    groups: [],
    arrows: [],
    document: null,
    metricViews: null,
  } as unknown as PackGraph);
  set(K.boardDone('p1', 'flow'), page);
  set(K.boardSince('p1', 'flow', startOfToday()), page);
  set(K.packView('p1', 'flow'), { path: null, view: null, problems: [] });
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <PackOverview
        projectId="p1"
        pack="flow"
        moving={[]}
        loaded
        movingError={undefined}
        asks={{ count: 1, oldest: undefined }}
      >
        <section data-needs-you />
      </PackOverview>
    </MemoryRouter>
  );
  const tiles = html.indexOf('data-numbers');
  const asks = html.indexOf('data-needs-you');
  const map = html.indexOf('data-pack-map');
  expect(tiles).toBeGreaterThan(-1);
  expect(asks).toBeGreaterThan(tiles);
  expect(map).toBeGreaterThan(asks);
});
