import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitCamera, fittedHeight, type Frame } from './map-camera';
import {
  layoutOverview,
  OVERVIEW_FIT_PAD,
  OVERVIEW_FULL_FIT_PAD,
  OVERVIEW_FULL_LEGEND_H,
  OVERVIEW_MAX_K,
  OVERVIEW_MIN_K,
  OVERVIEW_PAGE_MAX_H,
  OVERVIEW_SMALLEST_PX,
  OVERVIEW_TYPE_FLOOR_PX,
  type OverviewEdgePath,
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
 * PAGE_WIDTH wide and at most OVERVIEW_PAGE_MAX_H tall; full screen it is the whole screen less
 * the legend's band. PROJECTOR is a 1920x1080 screen full screen.
 */
const PAGE_WIDTH = 892;
const FULL: Frame = { width: 1440, height: 900 - OVERVIEW_FULL_LEGEND_H };
const PROJECTOR: Frame = { width: 1920, height: 1080 - OVERVIEW_FULL_LEGEND_H };

const views = Object.entries(shipped.views);
const root = shipped.views[shipped.root] as OverviewView;
const drillDowns = views.filter(([id]) => id !== shipped.root);

function fittedK(view: OverviewView, frame: Frame, pad: number): number {
  return fitCamera(layoutOverview(view).bounds, frame, pad, OVERVIEW_MIN_K, OVERVIEW_MAX_K).k;
}

/** Whether all of `view` is in `frame` at the scale it opens at. */
function fitsWhole(view: OverviewView, frame: Frame, pad: number): boolean {
  const { bounds } = layoutOverview(view);
  const k = fittedK(view, frame, pad);
  return (
    bounds.w * k <= frame.width - 2 * pad + 0.01 && bounds.h * k <= frame.height - 2 * pad + 0.01
  );
}

/** The page's frame for a view: as wide as measured, as tall as the fit wants up to the cap. */
function pageFrame(view: OverviewView): Frame {
  const { bounds } = layoutOverview(view);
  const height = Math.min(
    fittedHeight(bounds, PAGE_WIDTH, OVERVIEW_FIT_PAD, OVERVIEW_MIN_K, OVERVIEW_MAX_K),
    OVERVIEW_PAGE_MAX_H
  );
  return { width: PAGE_WIDTH, height };
}

const laneLines = (edges: OverviewEdgePath[]): OverviewEdgePath[] =>
  edges.filter(edge => edge.kind === 'loops-back' && edge.points.length === 4);

describe('the shipped overview, drawn', () => {
  test.each(views)(
    'view %s: no line, label, stub or bar runs through a card, a foreign group or another line',
    (_, view) => {
      expect(drawingFaults(view)).toEqual([]);
      expect(fanFaults(view)).toEqual([]);
    }
  );

  test('the root sends work back four ways in one lane; the checks drill-down to Build or Plan', () => {
    const lanes = laneLines(layoutOverview(root).edges);
    expect(lanes.map(edge => `${edge.from}->${edge.to}`).sort()).toEqual([
      'build->plan',
      'checks->build',
      'ci->build',
      'ci->found',
    ]);
    expect(lanes.find(edge => edge.to === 'found')?.shadow).toBe(true);
    const checks = layoutOverview(shipped.views.checks as OverviewView).edges;
    expect(laneLines(checks).map(edge => [edge.from, edge.to, edge.label])).toEqual([
      ['checks-verdict', 'checks-build', 'sent back to fix'],
      ['checks-verdict', 'checks-plan', 'replan'],
    ]);
  });

  test.each(views)(
    'view %s opens at a zoom that draws its smallest text at the type floor, on the page and full screen',
    (_, view) => {
      for (const k of [
        fittedK(view, pageFrame(view), OVERVIEW_FIT_PAD),
        fittedK(view, FULL, OVERVIEW_FULL_FIT_PAD),
      ])
        expect(OVERVIEW_SMALLEST_PX * k).toBeGreaterThanOrEqual(OVERVIEW_TYPE_FLOOR_PX);
    }
  );

  test.each(drillDowns)('drill-down %s fits whole on the page and full screen', (_, view) => {
    expect(fitsWhole(view, pageFrame(view), OVERVIEW_FIT_PAD)).toBe(true);
    expect(fitsWhole(view, FULL, OVERVIEW_FULL_FIT_PAD)).toBe(true);
  });

  test('the root fits whole full screen at 1920x1080 and in height on the page', () => {
    expect(fitsWhole(root, PROJECTOR, OVERVIEW_FULL_FIT_PAD)).toBe(true);
    expect(layoutOverview(root).bounds.h + 2 * OVERVIEW_FIT_PAD).toBeLessThanOrEqual(
      pageFrame(root).height
    );
  });
});

/** A small view: a card, a group `g` of `members`, a card after it, joined by `edges`. */
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
const fannedGroups = (view: OverviewView): string[] => [
  ...new Set(layoutOverview(view).fans.map(fan => fan.group)),
];

describe('a group drawn as parallel work fans its line out to each member', () => {
  test('the shipped file fans two: the root inputs and the three checks', () => {
    expect(views.flatMap(([, view]) => fannedGroups(view)).sort()).toEqual([
      'checks-three',
      'inputs',
    ]);
    const checks = layoutOverview(shipped.views.checks as OverviewView);
    expect(checks.fans.map(f => [f.group, f.side, f.into, f.stubs.length])).toEqual([
      ['checks-three', 'left', true, 3],
      ['checks-three', 'right', false, 3],
    ]);
  });

  test.each<[string, OverviewView, string[]]>([
    ['stacked in one column, met only along rows', grouped(THREE, THROUGH), ['g']],
    [
      'with a lane line rising into a member',
      grouped(THREE, [...THROUGH, { from: 'after', to: 'c', kind: 'loops-back' }]),
      ['g'],
    ],
    [
      'across two columns',
      grouped(
        [
          { id: 'a', col: 2, row: 2 },
          { id: 'b', col: 3, row: 2 },
        ],
        THROUGH
      ),
      [],
    ],
    [
      'with a member a forward line names',
      grouped(THREE, [...THROUGH, { from: 'a', to: 'after', kind: 'calls' }]),
      [],
    ],
  ])('a group %s', (_, view, expected) => {
    expect(fannedGroups(view)).toEqual(expected);
    expect(fanFaults(view)).toEqual([]);
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
    expect(layoutOverview(view).fans.map(f => [f.group, f.side, f.into])).toEqual([
      ['g', 'right', false],
      ['h', 'left', true],
    ]);
    expect(fanFaults(view)).toEqual([]);
  });
});
