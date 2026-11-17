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
  OVERVIEW_PAGE_MAX_H,
  OVERVIEW_SMALLEST_PX,
  OVERVIEW_TITLE_PX,
  type OverviewEdgePath,
} from './overview-layout';
import { drawingFaults } from './overview-layout.test-fixtures';
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
