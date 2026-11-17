import { describe, expect, test } from 'bun:test';
import {
  CARD_H,
  CARD_W,
  COL_PITCH,
  LANE,
  layoutMap,
  type ArrowPath,
  type Box,
  type MapLayout,
} from './map-layout';
import { shippedView } from '../item-detail.test-fixtures';
import { crosses, enters, segments } from './map-geometry.test-fixtures';
import { CHAR_W, LINE_H } from './map-sizes';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type MapBlock = Declaration['map'];

const SEVEN = ['triage', 'plan', 'build', 'checks', 'host', 'ready', 'landed'];

/** The shipped declaration with `stages` in this order, each given a card, and `map`'s arrows. */
function declaration(stages: readonly string[], map: Partial<MapBlock> = {}): Declaration {
  return {
    ...shippedView,
    stages: stages.map(id => ({
      id,
      label: id,
      blurb: id,
      group: 'build',
      workflows: [id],
    })),
    map: { cards: stages.map(stage => ({ stage })), arrows: [], ...map },
  };
}

/**
 * Seven stages with every kind of arrow: forward to the next stage, forward skipping one, and
 * send-backs from several stages into several targets. The layout is tested on it, not on the
 * shipped declaration, whose arrows follow the pack.
 */
const seven = declaration(SEVEN, {
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
});

const arrowOf = (layout: MapLayout, from: string, to: string): ArrowPath => {
  const found = layout.arrows.find(entry => entry.from === from && entry.to === to);
  if (found === undefined) throw new Error(`No arrow ${from} -> ${to}`);
  return found;
};

/** Every line the layout draws, by the arrow it belongs to. */
const lines = (layout: MapLayout) =>
  [
    ...layout.arrows.map(entry => ({ ...entry, back: false })),
    ...layout.feedback.paths.map(entry => ({ ...entry, back: true })),
  ].flatMap(entry => segments(entry.d).map(s => ({ id: entry.id, back: entry.back, s })));

function nothingEntersACard(layout: MapLayout): void {
  const boxes = [...layout.boxes.values()];
  for (const { s } of lines(layout)) for (const box of boxes) expect(enters(box, s)).toBe(false);
}

describe('one row', () => {
  const layout = layoutMap(seven);

  test('the cards sit in stages order, one pitch apart, all on one row', () => {
    expect(layout.rows).toBe(1);
    SEVEN.forEach((stage, i) => {
      expect(layout.boxes.get(stage)).toEqual({ x: i * COL_PITCH, y: 0, w: CARD_W, h: CARD_H });
    });
  });

  test('the order is the stages order: a card col and row written for the old grid are ignored', () => {
    const gridded = layoutMap({
      ...seven,
      map: {
        ...seven.map,
        cards: [...SEVEN].reverse().map((stage, i) => ({ stage, col: i + 1, row: 1 + (i % 2) })),
      },
    });
    expect(gridded.boxes).toEqual(layout.boxes);
  });

  test('a forward arrow runs from the right side of one card to the left side of the next', () => {
    const planned = arrowOf(layout, 'plan', 'build');
    expect(planned).toMatchObject({ back: false, lane: undefined, label: 'planned' });
    const mid = CARD_H / 2;
    expect(planned.d).toBe(`M${COL_PITCH + CARD_W},${mid} H${2 * COL_PITCH}`);
    expect(planned.labelAt.x).toBe((COL_PITCH + CARD_W + 2 * COL_PITCH) / 2);
    expect(planned.labelAt.y).toBeLessThan(mid);
  });

  test('every send-back is in the one feedback lane under the row, none among the forward arrows', () => {
    expect(layout.arrows.every(arrow => !arrow.back)).toBe(true);
    expect(layout.feedback.paths.map(path => `${path.from}->${path.to}`).sort()).toEqual([
      'checks->build',
      'checks->plan',
      'host->build',
    ]);
    expect(layout.feedback.labels.map(label => label.stage)).toEqual(['build', 'plan']);
  });

  test('a forward arrow that skips cards runs in a lane above the row, through no card', () => {
    const skip = layoutMap({
      ...seven,
      map: { ...seven.map, arrows: [...seven.map.arrows, { from: 'plan', to: 'host' }] },
    });
    const across = arrowOf(skip, 'plan', 'host');
    expect(across.lane).toBe(0);
    expect(across.d).toMatch(new RegExp(`^M[\\d.]+,0 V${-LANE} H[\\d.]+ V0$`));
    nothingEntersACard(skip);
    expect(skip.bounds.y).toBeLessThanOrEqual(-LANE);
  });

  test('no line enters a card, no forward arrow crosses a send-back, and bounds hold the lane labels', () => {
    nothingEntersACard(layout);
    const all = lines(layout);
    for (const p of all)
      for (const q of all) if (p.id !== q.id) expect(crosses(p.s, q.s)).toBe(false);
    const lowest = Math.max(
      ...layout.feedback.labels.flatMap(label => label.lines.map(line => line.at.y))
    );
    expect(layout.bounds.y + layout.bounds.h).toBeGreaterThanOrEqual(lowest + LINE_H / 2);
    expect(layout.bounds.w).toBe(6 * COL_PITCH + CARD_W);
  });
});

describe('two rows', () => {
  const layout = layoutMap(seven, 2);
  const row2 = layout.boxes.get('host')?.y ?? 0;

  test('the first half of the stages above, the rest below, each row left to right', () => {
    expect(layout.rows).toBe(2);
    expect(['triage', 'plan', 'build', 'checks'].map(s => layout.boxes.get(s)?.y)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(['host', 'ready', 'landed'].map(s => layout.boxes.get(s)?.x)).toEqual([
      0,
      COL_PITCH,
      2 * COL_PITCH,
    ]);
    expect(row2).toBeGreaterThan(CARD_H);
  });

  test('the hand-off between rows runs in a gap lane above the feedback lane', () => {
    const approved = arrowOf(layout, 'checks', 'host');
    expect(approved.lane).toBe(0);
    expect(approved.d).toMatch(
      new RegExp(`^M[\\d.]+,${CARD_H} V${CARD_H + LANE} H[\\d.]+ V${row2}$`)
    );
    const feedbackY = CARD_H + 2 * LANE;
    for (const path of layout.feedback.paths) expect(path.d).toContain(` V${feedbackY} `);
    for (const label of layout.feedback.labels)
      for (const line of label.lines) expect(line.at.y + LINE_H / 2).toBeLessThan(row2);
  });

  test('no send-back crosses another; only the hand-offs between the rows cross the lane', () => {
    nothingEntersACard(layout);
    const all = lines(layout);
    for (const p of all) {
      for (const q of all) {
        if (p.id === q.id || !crosses(p.s, q.s)) continue;
        // A crossing is between a forward hand-off between rows and a send-back.
        const forward = p.back ? q : p;
        expect(p.back !== q.back).toBe(true);
        expect(forward.id).toBe(arrowOf(layout, 'checks', 'host').id);
      }
    }
  });
});

describe('declarations the schema allows', () => {
  test('no cards: no boxes, no arrows, empty bounds', () => {
    const empty = layoutMap(declaration([], { arrows: [{ from: 'a', to: 'b' }] }));
    expect(empty.boxes.size).toBe(0);
    expect(empty.arrows).toEqual([]);
    expect(empty.feedback).toEqual({ paths: [], labels: [] });
    expect(empty.bounds).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test('a stage with no card takes no place, and an arrow to it is left out', () => {
    const partial = layoutMap({
      ...seven,
      map: { ...seven.map, cards: seven.map.cards.filter(card => card.stage !== 'plan') },
    });
    expect(partial.boxes.get('build')?.x).toBe(COL_PITCH);
    const drawn = [...partial.arrows, ...partial.feedback.paths];
    expect(drawn.some(entry => entry.from === 'plan' || entry.to === 'plan')).toBe(false);
    expect(drawn).toHaveLength(seven.map.arrows.length - 3);
  });
});

describe('several forward arrows between one pair of cards', () => {
  const twice = (from: string, to: string, labels: (string | undefined)[]) =>
    labels.map(label => ({ from, to, label }));
  const view = declaration(SEVEN, {
    arrows: [
      ...twice('triage', 'plan', ['build', 'narrow', 'build']),
      ...twice('plan', 'host', ['planned', undefined]),
      { from: 'host', to: 'build', label: 'returned', back: true },
      { from: 'host', to: 'build', label: 'asks', back: true },
    ],
  });

  test('draw as one arrow, their outcomes joined, each once, side to side and in a lane', () => {
    for (const rows of [1, 2] as const) {
      const layout = layoutMap(view, rows);
      expect(layout.arrows.map(arrow => [arrow.id, arrow.from, arrow.to, arrow.label])).toEqual([
        ['decl:0', 'triage', 'plan', 'build, narrow'],
        ['decl:3', 'plan', 'host', 'planned'],
      ]);
      // Send-backs stay one path each; the lane labels their target once.
      expect(layout.feedback.paths).toHaveLength(2);
      expect(layout.feedback.labels).toHaveLength(1);
    }
  });

  test('no two labels on the map share a point', () => {
    for (const map of [view, seven, shippedView]) {
      for (const rows of [1, 2] as const) {
        const layout = layoutMap(map, rows);
        const points = [
          ...layout.arrows.map(arrow => arrow.labelAt),
          ...layout.feedback.labels.flatMap(label => label.lines.map(line => line.at)),
        ].map(p => `${p.x.toString()},${p.y.toString()}`);
        expect(new Set(points).size).toBe(points.length);
      }
    }
  });
});

describe('the shipped map', () => {
  const layout = layoutMap(shippedView);
  const labelOf = (stage: string) =>
    layout.feedback.labels
      .find(label => label.stage === stage)
      ?.lines.map(line => line.text)
      .join(' ');

  test('one row of the eight stages in stages order', () => {
    const boxes = shippedView.stages.map(stage => layout.boxes.get(stage.id));
    expect(boxes.map(box => box?.y)).toEqual(Array(8).fill(0));
    expect(boxes.map(box => box?.x)).toEqual(shippedView.stages.map((_, i) => i * COL_PITCH));
  });

  test('only the declared arrows: every forward hand-off side to side between neighbours', () => {
    expect(layout.arrows.map(arrow => [arrow.from, arrow.to, arrow.lane])).toEqual([
      ['order', 'triage', undefined],
      ['triage', 'plan', undefined],
      ['plan', 'build', undefined],
      ['build', 'checks', undefined],
      ['checks', 'host', undefined],
      ['host', 'ready', undefined],
      ['ready', 'landed', undefined],
    ]);
  });

  test('the send-backs into Build share one leg and one label; replan returns to Plan', () => {
    expect(layout.feedback.paths.map(path => `${path.from}->${path.to}`)).toEqual([
      'checks->build',
      'host->build',
      'checks->plan',
    ]);
    const intoBuild = layout.feedback.paths.filter(path => path.to === 'build');
    expect(new Set(intoBuild.map(path => path.d.split(' ').at(-2))).size).toBe(1);
    expect(labelOf('build')).toBe('returned');
    expect(labelOf('plan')).toBe('replan');
  });

  test('nothing enters a card, no line crosses another, and the bounds hold the lane labels', () => {
    nothingEntersACard(layout);
    const all = lines(layout);
    for (const p of all)
      for (const q of all) if (p.id !== q.id) expect(crosses(p.s, q.s)).toBe(false);
    const bottoms = layout.feedback.labels.flatMap(l =>
      l.lines.map(line => line.at.y + LINE_H / 2)
    );
    expect(layout.bounds.y + layout.bounds.h).toBeGreaterThanOrEqual(Math.max(...bottoms));
  });

  test('no lane label overlaps another or a card', () => {
    const boxOf = (at: { x: number; y: number }, text: string): Box => ({
      x: at.x - (text.length * CHAR_W) / 2,
      y: at.y - LINE_H / 2,
      w: text.length * CHAR_W,
      h: LINE_H,
    });
    const owned = [
      ...layout.feedback.labels.flatMap(label =>
        label.lines.map(line => ({ owner: `lane:${label.stage}`, box: boxOf(line.at, line.text) }))
      ),
      ...[...layout.boxes].map(([stage, box]) => ({ owner: `card:${stage}`, box })),
    ];
    const overlap = (p: Box, q: Box): boolean =>
      p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    const clashes = owned.flatMap(p =>
      owned
        .filter(q => q.owner !== p.owner && overlap(p.box, q.box))
        .map(q => `${p.owner} on ${q.owner}`)
    );
    expect(clashes).toEqual([]);
  });
});
