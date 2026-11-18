import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIT_PAD,
  fitCamera,
  fittedHeight,
  MIN_ZOOM,
  TYPE_FLOOR_PX,
  type Frame,
} from './map-camera';
import {
  layoutOverview,
  OVERVIEW_GROUP_PAD,
  OVERVIEW_PAGE_MAX_H,
  OVERVIEW_SMALLEST_PX,
  OVERVIEW_TITLE_PX,
  type OverviewEdgePath,
  parallelGroups,
} from './overview-layout';
import { drawingFaults, fanFaults } from './overview-layout.test-fixtures';
import type { OverviewDeclaration, OverviewView } from './overview-nav';

/** The overview this repository ships, as the server lists it. */
const shipped = JSON.parse(
  readFileSync(
    join(
      import.meta.dir,
      '../../../../../../../.archon/packs/Wirasm.archon-software-factory.factory-overview.json'
    ),
    'utf8'
  )
) as OverviewDeclaration;

/*
 * The map frame at 1440x900, measured in a browser on `bun run dev:console`: on the page it is
 * 890 px wide (the Factory section's wide body, less the views sidebar) and at most
 * OVERVIEW_PAGE_MAX_H tall; full screen it is 1198 x 744 (the screen less the sidebar, the
 * breadcrumb, the controls and the legend). Change these when the frame's surroundings change.
 */
const PAGE_WIDTH = 890;
const FULL: Frame = { width: 1198, height: 744 };
const TITLE_FLOOR_PX = 14;

const views = Object.entries(shipped.views);

describe('the shipped overview, drawn', () => {
  test.each(views)(
    'view %s: no line runs through a card, a foreign group, or another line',
    (_, view) => {
      expect(drawingFaults(view)).toEqual([]);
    }
  );

  test('the root has exactly one loops-back lane, under every box', () => {
    const layout = layoutOverview(shipped.views[shipped.root] as OverviewView);
    const lanes = layout.edges.filter(edge => edge.kind === 'loops-back');
    expect(lanes.length).toBe(1);
    const laneY = (lanes[0] as OverviewEdgePath).points[1]?.y ?? 0;
    const lowest = Math.max(
      ...[...layout.cards.values(), ...layout.groups.values()].map(b => b.y + b.h)
    );
    expect(laneY).toBeGreaterThan(lowest);
  });

  /** The fitted scale in `frame`, after checking the whole view fits it at that scale. */
  function fitted(view: OverviewView, frame: Frame): number {
    const { bounds } = layoutOverview(view);
    const { k } = fitCamera(bounds, frame, FIT_PAD, MIN_ZOOM);
    expect(bounds.w * k).toBeLessThanOrEqual(frame.width - 2 * FIT_PAD + 0.01);
    expect(bounds.h * k).toBeLessThanOrEqual(frame.height - 2 * FIT_PAD + 0.01);
    return k;
  }

  /** The page's frame for a view: as wide as measured, as tall as the fit wants up to the cap. */
  function pageFrame(view: OverviewView): Frame {
    const { bounds } = layoutOverview(view);
    const height = Math.min(
      fittedHeight(bounds, PAGE_WIDTH, FIT_PAD, MIN_ZOOM),
      OVERVIEW_PAGE_MAX_H
    );
    return { width: PAGE_WIDTH, height };
  }

  test.each(views)(
    'view %s fits whole with titles at 14 px or more and no text under the type floor, on the page and full screen',
    (_, view) => {
      for (const k of [fitted(view, pageFrame(view)), fitted(view, FULL)]) {
        expect(OVERVIEW_TITLE_PX * k).toBeGreaterThanOrEqual(TITLE_FLOOR_PX);
        expect(OVERVIEW_SMALLEST_PX * k).toBeGreaterThanOrEqual(TYPE_FLOOR_PX);
      }
    }
  );
});

/** A small view: a card, a group of `members` in column 2, a card after it, joined by `edges`. */
function grouped(
  members: { id: string; col: number; row: number }[],
  edges: OverviewView['edges']
): OverviewView {
  const card = (id: string, col: number, row: number, group?: string) => ({
    id,
    title: id,
    text: id,
    icon: 'flag' as const,
    kind: 'check' as const,
    col,
    row,
    ...(group === undefined ? {} : { group }),
  });
  return {
    cards: [
      card('before', 1, 2),
      ...members.map(m => card(m.id, m.col, m.row, 'g')),
      card('after', 4, 2),
    ],
    groups: [{ id: 'g', label: 'G' }],
    edges,
  } as OverviewView;
}

const THREE = [
  { id: 'a', col: 2, row: 1 },
  { id: 'b', col: 2, row: 2 },
  { id: 'c', col: 2, row: 3 },
];
const THROUGH: OverviewView['edges'] = [
  { from: 'before', to: 'g', kind: 'feeds' },
  { from: 'g', to: 'after', kind: 'feeds' },
];

describe('parallel groups', () => {
  test('the shipped file has two: the root inputs and the three checks', () => {
    const found = views.flatMap(([, view]) => [...parallelGroups(view)]);
    expect(found.sort()).toEqual(['checks-three', 'inputs']);
  });

  test('a group stacked in one column, met only along rows, is parallel', () => {
    expect([...parallelGroups(grouped(THREE, THROUGH))]).toEqual(['g']);
  });

  test('a group across two columns is not', () => {
    const wide = [
      { id: 'a', col: 2, row: 2 },
      { id: 'b', col: 3, row: 2 },
    ];
    expect(parallelGroups(grouped(wide, THROUGH)).size).toBe(0);
  });

  test('a group one of whose members a line names is not', () => {
    const edges = [...THROUGH, { from: 'a', to: 'after', kind: 'calls' as const }];
    expect(parallelGroups(grouped(THREE, edges)).size).toBe(0);
  });

  test('a group met along a column is not', () => {
    const view = grouped(THREE, [{ from: 'g', to: 'below', kind: 'feeds' }]);
    view.cards.push({
      ...(view.cards[0] as OverviewView['cards'][number]),
      id: 'below',
      col: 2,
      row: 4,
    });
    expect(parallelGroups(view).size).toBe(0);
  });

  test('a line between two parallel groups fans at both ends', () => {
    const view = grouped(THREE, [{ from: 'g', to: 'h', kind: 'feeds' }]);
    view.groups?.push({ id: 'h', label: 'H' });
    for (const row of [1, 2, 3])
      view.cards.push({
        ...(view.cards[0] as OverviewView['cards'][number]),
        id: `h${row}`,
        col: 3,
        row,
        group: 'h',
      });
    const layout = layoutOverview(view);
    expect(layout.fans.map(f => [f.group, f.side, f.into])).toEqual([
      ['g', 'right', false],
      ['h', 'left', true],
    ]);
    expect(fanFaults(view)).toEqual([]);
  });

  test('the checks drill-down fans into and out of each of its three checks', () => {
    const layout = layoutOverview(shipped.views.checks as OverviewView);
    expect(layout.fans.map(f => [f.group, f.side, f.into, f.stubs.length])).toEqual([
      ['checks-three', 'left', true, 3],
      ['checks-three', 'right', false, 3],
    ]);
    expect([...layout.contentSized].sort()).toEqual([
      'checks-product',
      'checks-review',
      'checks-tests',
    ]);
    for (const fan of layout.fans)
      for (const stub of fan.stubs)
        expect(Math.abs(stub.to.x - stub.from.x)).toBe(OVERVIEW_GROUP_PAD);
  });

  test.each(views)(
    'view %s: a stub meets only its own card and the edge it branches at that edge end, a bar no card and only that edge',
    (_, view) => {
      expect(fanFaults(view)).toEqual([]);
    }
  );
});
