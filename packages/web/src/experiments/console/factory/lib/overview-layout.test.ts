import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIT_PAD, fitCamera, fittedHeight, MIN_ZOOM, type Frame } from './map-camera';
import type { Box, Point } from './map-layout';
import {
  layoutOverview,
  OVERVIEW_PAGE_MAX_H,
  OVERVIEW_TITLE_PX,
  type OverviewEdgePath,
} from './overview-layout';
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

/** A segment as a box with no width or no height. */
function segments(edge: OverviewEdgePath): Box[] {
  return edge.points.slice(1).map((end, i) => {
    const start = edge.points[i] as Point;
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      w: Math.abs(end.x - start.x),
      h: Math.abs(end.y - start.y),
    };
  });
}

/** Whether two boxes share any point, edges included. */
const meets = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** The boxes a line must not touch: every card but its ends, every group holding neither. */
function obstacles(
  view: OverviewView,
  edge: OverviewEdgePath,
  layout = layoutOverview(view)
): [string, Box][] {
  const groupOf = (id: string): string | undefined => view.cards.find(c => c.id === id)?.group;
  const ends = new Set([edge.from, edge.to, groupOf(edge.from), groupOf(edge.to)]);
  return [...layout.cards, ...layout.groups].filter(([id]) => !ends.has(id));
}

const views = Object.entries(shipped.views);

describe('the shipped overview, drawn', () => {
  test.each(views)(
    'view %s: no line runs through a card, a foreign group, or another line',
    (_, view) => {
      const layout = layoutOverview(view);
      expect(layout.edges.length).toBe(view.edges.length);
      const hits: string[] = [];
      layout.edges.forEach((edge, i) => {
        for (const [id, box] of obstacles(view, edge, layout))
          if (segments(edge).some(run => meets(run, box)))
            hits.push(`${edge.from}->${edge.to} hits ${id}`);
        for (const other of layout.edges.slice(i + 1))
          if (segments(edge).some(run => segments(other).some(run2 => meets(run, run2))))
            hits.push(`${edge.from}->${edge.to} meets ${other.from}->${other.to}`);
      });
      expect(hits).toEqual([]);
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
    'view %s fits whole with titles at 14 px or more, on the page and full screen',
    (_, view) => {
      expect(OVERVIEW_TITLE_PX * fitted(view, pageFrame(view))).toBeGreaterThanOrEqual(
        TITLE_FLOOR_PX
      );
      expect(OVERVIEW_TITLE_PX * fitted(view, FULL)).toBeGreaterThanOrEqual(TITLE_FLOOR_PX);
    }
  );
});
