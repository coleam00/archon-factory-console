import { describe, expect, test } from 'bun:test';
import {
  arrowPaths,
  cardBoxes,
  CARD_H,
  CARD_W,
  COL_PITCH,
  LANE,
  mapBounds,
  ROW_PITCH,
  type ArrowPath,
} from './map-layout';
import { shippedView } from '../item-detail.test-fixtures';

const map = shippedView.map;
const boxes = cardBoxes(map);
const arrows = arrowPaths(map, boxes);
const arrow = (from: string, to: string): ArrowPath => {
  const found = arrows.find(entry => entry.from === from && entry.to === to);
  if (found === undefined) throw new Error(`No arrow ${from} -> ${to}`);
  return found;
};

describe('the map layout of the software factory', () => {
  test('cards sit on the declared grid, one pitch per column and row', () => {
    expect(boxes.get('triage')).toEqual({ x: 0, y: 0, w: CARD_W, h: CARD_H });
    expect(boxes.get('build')).toEqual({ x: 2 * COL_PITCH, y: 0, w: CARD_W, h: CARD_H });
    expect(boxes.get('landed')?.x).toBe(6 * COL_PITCH);
    expect(boxes.size).toBe(7);
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

  test('the three back arrows take three lanes below the row, the shortest span nearest', () => {
    const lanes = [arrow('checks', 'build'), arrow('host', 'build'), arrow('checks', 'plan')].map(
      entry => entry.lane
    );
    expect(lanes).toEqual([0, 1, 2]);
    for (const entry of arrows.filter(a => a.back)) {
      expect(entry.labelAt.y).toBe(CARD_H + LANE * ((entry.lane ?? 0) + 1));
      // Down from the source's bottom edge, across, and up into the target's bottom edge.
      expect(entry.d).toMatch(new RegExp(`^M[\\d.]+,${CARD_H} V[\\d.]+ H[\\d.]+ V${CARD_H}$`));
    }
  });

  test('lanes go by span, not by declaration order: the shortest return stays nearest', () => {
    const reversed = { ...map, arrows: [...map.arrows].reverse() };
    const drawn = arrowPaths(reversed, cardBoxes(reversed));
    const laneOf = (from: string, to: string): number | undefined =>
      drawn.find(entry => entry.from === from && entry.to === to)?.lane;
    // Declared last now, the shortest return still takes the nearest lane; the two equal
    // spans share the next two.
    expect(laneOf('checks', 'build')).toBe(0);
    expect(new Set([laneOf('host', 'build'), laneOf('checks', 'plan')])).toEqual(new Set([1, 2]));
  });

  test('two back arrows into one card meet its bottom edge at different points', () => {
    const ends = [arrow('checks', 'build'), arrow('host', 'build')].map(entry =>
      entry.d.split(' ').at(-2)
    );
    expect(new Set(ends).size).toBe(2);
  });

  test('bounds hold every card and the lowest lane label', () => {
    const bounds = mapBounds(boxes, arrows);
    expect(bounds.x).toBe(0);
    expect(bounds.w).toBe(6 * COL_PITCH + CARD_W);
    expect(bounds.y + bounds.h).toBeGreaterThan(CARD_H + 3 * LANE);
  });
});

describe('declarations the schema allows', () => {
  test('no cards: no boxes, no arrows, empty bounds', () => {
    const empty = { cards: [], arrows: [{ from: 'a', to: 'b' }] };
    const none = cardBoxes(empty);
    expect(arrowPaths(empty, none)).toEqual([]);
    expect(mapBounds(none, [])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test('an arrow to a stage with no card is left out', () => {
    const partial = { ...map, cards: map.cards.filter(card => card.stage !== 'plan') };
    const drawn = arrowPaths(partial, cardBoxes(partial));
    expect(drawn.some(entry => entry.from === 'plan' || entry.to === 'plan')).toBe(false);
    expect(drawn).toHaveLength(map.arrows.length - 3);
  });

  test('a forward arrow across rows is an elbow; in one column it runs bottom to top', () => {
    const grid = {
      cards: [
        { stage: 'a', col: 1, row: 1 },
        { stage: 'b', col: 2, row: 2 },
        { stage: 'c', col: 2, row: 3 },
      ],
      arrows: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
    };
    const [elbow, down] = arrowPaths(grid, cardBoxes(grid));
    expect(elbow?.d).toMatch(/^M[\d.]+,[\d.]+ H[\d.]+ V[\d.]+ H[\d.]+$/);
    expect(down?.d).toBe(`M${COL_PITCH + CARD_W / 2},${ROW_PITCH + CARD_H} V${2 * ROW_PITCH}`);
  });
});
