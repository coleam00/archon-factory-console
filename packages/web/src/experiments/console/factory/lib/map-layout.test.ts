import { describe, expect, test } from 'bun:test';
import {
  CARD_H,
  CARD_W,
  COL_PITCH,
  LANE,
  layoutMap,
  ROW_GAP,
  type ArrowPath,
  type Box,
  type MapLayout,
} from './map-layout';
import type { PackGraph } from '../../skills/packs';
import { shippedListed, shippedView } from '../item-detail.test-fixtures';
import livePackGraph from './fixtures/pack-graph.json';
import { mapArrowsFromGraph } from './map-graph';
import type { FactoryViewListed } from './views';

/**
 * A two-row map of seven stages with every kind of arrow: forward in a row, down to the next
 * row, and returns within and between rows. The layout is tested on it, not on the shipped
 * declaration, whose cards and arrows follow the pack.
 */
const twoRows: FactoryViewListed['declaration']['map'] = {
  cards: [
    { stage: 'triage', col: 1, row: 1 },
    { stage: 'plan', col: 2, row: 1 },
    { stage: 'build', col: 3, row: 1 },
    { stage: 'checks', col: 4, row: 1 },
    { stage: 'host', col: 1, row: 2 },
    { stage: 'ready', col: 2, row: 2 },
    { stage: 'landed', col: 3, row: 2 },
  ],
  arrows: [
    { from: 'triage', to: 'plan', label: 'build' },
    { from: 'plan', to: 'build', label: 'planned' },
    { from: 'build', to: 'checks', label: 'built' },
    { from: 'checks', to: 'host', label: 'approved' },
    { from: 'host', to: 'ready', label: 'ready' },
    { from: 'ready', to: 'landed', label: 'landed' },
    { from: 'checks', to: 'build', label: 'returned', back: true },
    { from: 'host', to: 'build', label: 'returned', back: true },
    { from: 'checks', to: 'plan', label: 'replan', back: true },
  ],
};

const arrowOf = (layout: MapLayout, from: string, to: string): ArrowPath => {
  const found = layout.arrows.find(entry => entry.from === from && entry.to === to);
  if (found === undefined) throw new Error(`No arrow ${from} -> ${to}`);
  return found;
};

/** A path of M, H and V commands as its straight segments. */
function segments(d: string): { x1: number; y1: number; x2: number; y2: number }[] {
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  let x = 0;
  let y = 0;
  for (const command of d.split(' ')) {
    const [kind, rest] = [command[0], command.slice(1)];
    if (kind === 'M') {
      [x, y] = rest.split(',').map(Number) as [number, number];
      continue;
    }
    const next = Number(rest);
    const [nx, ny] = kind === 'H' ? [next, y] : [x, next];
    out.push({ x1: x, y1: y, x2: nx, y2: ny });
    [x, y] = [nx, ny];
  }
  return out;
}

const inside = (box: Box, p: { x: number; y: number }): boolean =>
  p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;

/** Whether an axis-aligned segment enters the box's interior, shrunk by half a pixel. */
function enters(box: Box, s: { x1: number; y1: number; x2: number; y2: number }): boolean {
  const [l, r, t, b] = [box.x + 0.5, box.x + box.w - 0.5, box.y + 0.5, box.y + box.h - 0.5];
  const [sl, sr] = [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)];
  const [st, sb] = [Math.min(s.y1, s.y2), Math.max(s.y1, s.y2)];
  return sl <= r && sr >= l && st <= b && sb >= t;
}

describe('a map of two rows', () => {
  const layout = layoutMap(twoRows);
  const arrow = (from: string, to: string): ArrowPath => arrowOf(layout, from, to);
  const row2 = layout.boxes.get('host')?.y ?? 0;

  test('row 2 sits below a gap with room for the four lane arrows it carries', () => {
    expect(layout.boxes.get('triage')).toEqual({ x: 0, y: 0, w: CARD_W, h: CARD_H });
    expect(layout.boxes.get('host')).toEqual({ x: 0, y: row2, w: CARD_W, h: CARD_H });
    expect(layout.boxes.get('landed')?.x).toBe(2 * COL_PITCH);
    expect(row2 - CARD_H).toBeGreaterThanOrEqual((4 + 1) * LANE);
    expect(layout.boxes.size).toBe(7);
  });

  test('the hand-off to the next row runs down to a lane, across, and down into its top edge', () => {
    const approved = arrow('checks', 'host');
    expect(approved.back).toBe(false);
    expect(approved.lane).toBeDefined();
    expect(approved.d).toMatch(new RegExp(`^M[\\d.]+,${CARD_H} V[\\d.]+ H[\\d.]+ V${row2}$`));
  });

  test('a return from row 2 leaves its top edge and ends at the bottom edge of row 1', () => {
    const returned = arrow('host', 'build');
    expect(returned).toMatchObject({ back: true, label: 'returned' });
    expect(returned.d).toMatch(new RegExp(`^M[\\d.]+,${row2} V[\\d.]+ H[\\d.]+ V${CARD_H}$`));
  });

  test('ports on a card edge go in lane order, so lines leaving one edge do not cross', () => {
    const startX = (entry: ArrowPath): number => Number(entry.d.split(',')[0]?.slice(1));
    const endX = (entry: ArrowPath): number => Number(entry.d.split(' ').at(-2)?.slice(1));
    // On checks' bottom edge, all three run left: the deeper the lane, the nearer the centre.
    const fromChecks = [arrow('checks', 'build'), arrow('checks', 'plan'), arrow('checks', 'host')];
    expect(fromChecks.map(entry => entry.lane)).toEqual([0, 2, 3]);
    const xs = fromChecks.map(startX);
    expect([...xs].sort((p, q) => p - q)).toEqual(xs);
    // On host's top edge the deeper lane is nearer the card, so it runs outermost.
    expect(startX(arrow('host', 'build'))).toBeLessThan(endX(arrow('checks', 'host')));
  });

  test('every lane label sits in the gap between the rows', () => {
    const laned = layout.arrows.filter(entry => entry.lane !== undefined);
    expect(laned).toHaveLength(4);
    for (const entry of laned) {
      expect(entry.labelAt.y).toBeGreaterThan(CARD_H);
      expect(entry.labelAt.y).toBeLessThan(row2);
    }
  });

  test('no arrow runs through a card, and no label sits on one', () => {
    const boxes = [...layout.boxes.values()];
    for (const entry of layout.arrows) {
      for (const segment of segments(entry.d)) {
        for (const box of boxes) expect(enters(box, segment)).toBe(false);
      }
      for (const box of boxes) expect(inside(box, entry.labelAt)).toBe(false);
    }
  });

  test('bounds hold both rows and every label', () => {
    expect(layout.bounds.x).toBe(0);
    expect(layout.bounds.w).toBe(3 * COL_PITCH + CARD_W);
    expect(layout.bounds.y + layout.bounds.h).toBe(row2 + CARD_H);
  });
});

/** The factory's seven stages in one row, as the map shipped before it took two. */
const oneRow = {
  ...twoRows,
  cards: ['triage', 'plan', 'build', 'checks', 'host', 'ready', 'landed'].map((stage, i) => ({
    stage,
    col: i + 1,
    row: 1,
  })),
};

describe('a map of one row', () => {
  const layout = layoutMap(oneRow);
  const arrow = (from: string, to: string): ArrowPath => arrowOf(layout, from, to);

  test('cards sit on the declared grid, one pitch per column', () => {
    expect(layout.boxes.get('build')).toEqual({ x: 2 * COL_PITCH, y: 0, w: CARD_W, h: CARD_H });
    expect(layout.boxes.get('landed')?.x).toBe(6 * COL_PITCH);
  });

  test('a forward arrow runs from the right side of one card to the left side of the next', () => {
    const planned = arrow('plan', 'build');
    expect(planned).toMatchObject({ back: false, lane: undefined, label: 'planned' });
    const mid = CARD_H / 2;
    expect(planned.d).toBe(`M${COL_PITCH + CARD_W},${mid} H${2 * COL_PITCH}`);
    // The label sits above the line, centred in the gap.
    expect(planned.labelAt.x).toBe((COL_PITCH + CARD_W + 2 * COL_PITCH) / 2);
    expect(planned.labelAt.y).toBeLessThan(mid);
  });

  test('the three returns take three lanes below the row, the shortest span nearest', () => {
    const lanes = [arrow('checks', 'build'), arrow('host', 'build'), arrow('checks', 'plan')].map(
      entry => entry.lane
    );
    expect(lanes).toEqual([0, 1, 2]);
    for (const entry of layout.arrows.filter(a => a.back)) {
      expect(entry.labelAt.y).toBe(CARD_H + LANE * ((entry.lane ?? 0) + 1));
      // Down from the source's bottom edge, across, and up into the target's bottom edge.
      expect(entry.d).toMatch(new RegExp(`^M[\\d.]+,${CARD_H} V[\\d.]+ H[\\d.]+ V${CARD_H}$`));
    }
  });

  test('lanes go by span, not by declaration order: the shortest return stays nearest', () => {
    const reversed = layoutMap({ ...oneRow, arrows: [...oneRow.arrows].reverse() });
    const laneOf = (from: string, to: string): number | undefined =>
      arrowOf(reversed, from, to).lane;
    // Declared last now, the shortest return still takes the nearest lane; the two equal
    // spans share the next two.
    expect(laneOf('checks', 'build')).toBe(0);
    expect(new Set([laneOf('host', 'build'), laneOf('checks', 'plan')])).toEqual(new Set([1, 2]));
  });

  test('two returns into one card meet its bottom edge at different points', () => {
    const ends = [arrow('checks', 'build'), arrow('host', 'build')].map(entry =>
      entry.d.split(' ').at(-2)
    );
    expect(new Set(ends).size).toBe(2);
  });

  test('bounds hold every card and the lowest lane label', () => {
    expect(layout.bounds.x).toBe(0);
    expect(layout.bounds.w).toBe(6 * COL_PITCH + CARD_W);
    expect(layout.bounds.y + layout.bounds.h).toBeGreaterThan(CARD_H + 3 * LANE);
  });
});

describe('declarations the schema allows', () => {
  test('no cards: no boxes, no arrows, empty bounds', () => {
    const empty = layoutMap({ cards: [], arrows: [{ from: 'a', to: 'b' }] });
    expect(empty.boxes.size).toBe(0);
    expect(empty.arrows).toEqual([]);
    expect(empty.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test('an arrow to a stage with no card is left out', () => {
    const map = twoRows;
    const partial = layoutMap({ ...map, cards: map.cards.filter(card => card.stage !== 'plan') });
    expect(partial.arrows.some(entry => entry.from === 'plan' || entry.to === 'plan')).toBe(false);
    expect(partial.arrows).toHaveLength(map.arrows.length - 3);
  });

  test('a forward arrow to another row and column takes a lane; in one column it runs straight', () => {
    const grid = layoutMap({
      cards: [
        { stage: 'a', col: 1, row: 1 },
        { stage: 'b', col: 2, row: 2 },
        { stage: 'c', col: 2, row: 3 },
      ],
      arrows: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    });
    const [across, down] = grid.arrows;
    const b = grid.boxes.get('b');
    const c = grid.boxes.get('c');
    expect(across?.d).toMatch(new RegExp(`^M[\\d.]+,${CARD_H} V[\\d.]+ H[\\d.]+ V${b?.y}$`));
    expect(across?.lane).toBe(0);
    // An empty-laned gap keeps the least row gap.
    expect(c?.y).toBe((b?.y ?? 0) + CARD_H + ROW_GAP);
    expect(down?.d).toBe(`M${COL_PITCH + CARD_W / 2},${(b?.y ?? 0) + CARD_H} V${c?.y}`);
  });
});

describe('the shipped map with the live pack graph', () => {
  const graph = mapArrowsFromGraph(shippedView, shippedListed.runNames, livePackGraph as PackGraph);
  const layout = layoutMap(shippedView.map, graph);
  const row2 = layout.boxes.get('checks')?.y ?? 0;

  test('two arrows between one pair of cards keep their own ids and lanes', () => {
    const intoBuild = layout.arrows.filter(entry => entry.from === 'host' && entry.to === 'build');
    expect(intoBuild.map(entry => [entry.label, entry.back])).toEqual([
      ['returned', true],
      ['asks answered', true],
    ]);
    expect(new Set(intoBuild.map(entry => entry.id)).size).toBe(2);
    expect(new Set(intoBuild.map(entry => entry.lane)).size).toBe(2);
  });

  test('a forward hand-off from the graph runs side to side, as a declared one does', () => {
    const planned = layout.arrows.find(entry => entry.from === 'plan' && entry.to === 'build');
    expect(planned).toMatchObject({
      label: 'planned',
      back: false,
      lane: undefined,
      style: 'solid',
    });
  });

  test("plan's answered asks loop above row 1; the ends sit off each card's outer edge", () => {
    expect(layout.loops.map(loop => [loop.stage, loop.label])).toEqual([['plan', 'asks answered']]);
    expect(layout.loops[0]?.labelAt.y).toBeLessThan(0);
    const ends = new Map(layout.stubs.map(stub => [stub.stage, stub]));
    expect([...ends.keys()].sort()).toEqual(['order', 'ready', 'triage']);
    // Wrapped to about a card's width, reading top to bottom, above row 1 and below row 2.
    const triage = ends.get('triage')?.lines ?? [];
    expect(triage.map(line => line.text)).toEqual([
      'recipe, native, fold,',
      'park, deprecate, decline,',
      'close',
    ]);
    expect(triage.map(line => line.at.y)).toEqual(
      [...triage.map(line => line.at.y)].sort((p, q) => p - q)
    );
    expect(Math.max(...triage.map(line => line.at.y))).toBeLessThan(0);
    expect(ends.get('ready')?.lines[0]?.at.y).toBeGreaterThan(row2 + CARD_H);
  });

  test('bounds hold the loops and ends; no arrow runs through a card', () => {
    const lowest = Math.max(...layout.stubs.map(stub => stub.extent.y + stub.extent.h));
    expect(layout.bounds.y).toBeLessThan(0);
    expect(layout.bounds.y + layout.bounds.h).toBe(lowest);
    const boxes = [...layout.boxes.values()];
    for (const entry of layout.arrows)
      for (const segment of segments(entry.d))
        for (const box of boxes) expect(enters(box, segment)).toBe(false);
  });
});
