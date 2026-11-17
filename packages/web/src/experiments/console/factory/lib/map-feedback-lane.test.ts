import { describe, expect, test } from 'bun:test';
import {
  feedbackLane,
  laneLabelRoom,
  type FeedbackLane,
  type LaneCard,
  type LaneSide,
  type SendBack,
} from './map-feedback-lane';
import { crosses, enters, horizontal, segments } from './map-geometry.test-fixtures';
import { CARD_H, CARD_W, COL_PITCH, LANE } from './map-sizes';

const STAGES = ['triage', 'plan', 'build', 'checks', 'host', 'ready', 'landed'];

/** Send-backs from several stages into several targets, one into its own card. */
const sendBack = (from: string, to: string, label: string): SendBack => ({
  id: `${from}->${to}:${label}`,
  from,
  to,
  label,
});
const SEND_BACKS: SendBack[] = [
  sendBack('checks', 'build', 'returned'),
  sendBack('host', 'build', 'returned'),
  sendBack('host', 'build', 'asks answered'),
  sendBack('checks', 'plan', 'replan'),
  sendBack('plan', 'plan', 'asks answered'),
  sendBack('ready', 'build', 'landing failed'),
];

const oneRow = new Map(
  STAGES.map((stage, i): [string, LaneCard] => [
    stage,
    { box: { x: i * COL_PITCH, y: 0, w: CARD_W, h: CARD_H }, side: 'one' },
  ])
);
const ONE_Y = CARD_H + LANE;

/** The same stages in two rows, four over three, the lane in the gap between them. */
const TWO_Y = CARD_H + LANE;
const ROW2 = TWO_Y + 60;
const twoRows = new Map(
  STAGES.map((stage, i): [string, LaneCard] => {
    const upper = i < 4;
    const side: LaneSide = upper ? 'upper' : 'lower';
    const col = upper ? i : i - 4;
    return [
      stage,
      { box: { x: col * COL_PITCH, y: upper ? 0 : ROW2, w: CARD_W, h: CARD_H }, side },
    ];
  })
);

const edgeOf = (card: LaneCard | undefined): number =>
  card?.side === 'lower' ? card.box.y : (card?.box.y ?? 0) + (card?.box.h ?? 0);

/** What holds in either arrangement: one lane, legs on card edges, nothing crossing. */
function oneLaneNothingCrossing(
  lane: FeedbackLane,
  cards: ReadonlyMap<string, LaneCard>,
  y: number
): void {
  expect(lane.paths).toHaveLength(SEND_BACKS.length);
  for (const path of lane.paths) {
    const [down, run, up, ...rest] = segments(path.d);
    expect(rest).toEqual([]);
    // Out of the source's lane edge to the lane, along it, and into the target's lane edge.
    expect([down?.y1, down?.y2]).toEqual([edgeOf(cards.get(path.from)), y]);
    expect(run !== undefined && horizontal(run) && run.y1 === y).toBe(true);
    expect([up?.y1, up?.y2]).toEqual([y, edgeOf(cards.get(path.to))]);
  }
  const all = lane.paths.flatMap(path => segments(path.d).map(s => ({ id: path.id, s })));
  for (const p of all) {
    for (const q of all) if (p.id !== q.id) expect(crosses(p.s, q.s)).toBe(false);
    for (const card of cards.values()) expect(enters(card.box, p.s)).toBe(false);
  }
}

/** Each card's leg x's, by the role they play. */
function legs(lane: FeedbackLane): {
  to: Map<string, Set<number>>;
  from: Map<string, Set<number>>;
} {
  const to = new Map<string, Set<number>>();
  const from = new Map<string, Set<number>>();
  const add = (map: Map<string, Set<number>>, stage: string, x: number | undefined): void => {
    map.set(stage, (map.get(stage) ?? new Set()).add(x ?? Number.NaN));
  };
  for (const path of lane.paths) {
    const s = segments(path.d);
    add(from, path.from, s[0]?.x1);
    add(to, path.to, s.at(-1)?.x1);
  }
  return { to, from };
}

describe('the feedback lane under one row', () => {
  const lane = feedbackLane(oneRow, ONE_Y, SEND_BACKS);

  test('every send-back runs on one lane, from card edge to card edge, and none crosses another or a card', () => {
    oneLaneNothingCrossing(lane, oneRow, ONE_Y);
  });

  test('a card has one target leg and one source leg, the target on the left', () => {
    const { to, from } = legs(lane);
    for (const [stage, xs] of to) {
      expect(xs.size).toBe(1);
      const source = from.get(stage);
      if (source !== undefined) {
        expect(source.size).toBe(1);
        expect([...xs][0]).toBeLessThan([...source][0] ?? 0);
      }
    }
    for (const xs of from.values()) expect(xs.size).toBe(1);
  });

  test("a stage's own asks draw a short U on the lane under its card", () => {
    const u = lane.paths.find(path => path.from === 'plan' && path.to === 'plan');
    const plan = oneRow.get('plan')?.box;
    expect(u?.d).toBe(
      `M${(plan?.x ?? 0) + CARD_W * 0.65},${CARD_H} V${ONE_Y} H${(plan?.x ?? 0) + CARD_W * 0.35} V${CARD_H}`
    );
  });

  test('one label per target, under the lane on its leg, each outcome once', () => {
    expect(lane.labels.map(label => label.stage)).toEqual(['build', 'plan']);
    const text = (stage: string) =>
      lane.labels
        .find(label => label.stage === stage)
        ?.lines.map(line => line.text)
        .join(' ');
    // Two returns into Build, from Checks and from CI and review, are one outcome.
    expect(text('build')).toBe('returned, asks answered, landing failed');
    expect(text('plan')).toBe('replan, asks answered');
    const build = lane.labels.find(label => label.stage === 'build');
    const { to } = legs(lane);
    expect(build?.lines.length).toBeGreaterThan(1);
    for (const line of build?.lines ?? []) {
      expect(line.at.x).toBe([...(to.get('build') ?? [])][0] ?? 0);
      expect(line.at.y).toBeGreaterThan(ONE_Y);
    }
  });

  test('the extent holds the lane and its labels; the label room is what they take', () => {
    expect(lane.extent?.y).toBe(ONE_Y);
    const lowest = Math.max(...lane.labels.flatMap(label => label.lines.map(line => line.at.y)));
    expect((lane.extent?.y ?? 0) + (lane.extent?.h ?? 0)).toBeGreaterThan(lowest);
    expect(ONE_Y + laneLabelRoom(SEND_BACKS)).toBe((lane.extent?.y ?? 0) + (lane.extent?.h ?? 0));
  });

  test('a send-back to or from a stage with no card is left out; none at all draws nothing', () => {
    const partial = feedbackLane(oneRow, ONE_Y, [sendBack('checks', 'nowhere', 'returned')]);
    expect(partial).toEqual({ paths: [], labels: [], extent: undefined });
    expect(laneLabelRoom([])).toBe(0);
  });
});

describe('the feedback lane between two rows', () => {
  const lane = feedbackLane(twoRows, TWO_Y, SEND_BACKS);

  test('one lane, and no send-back crosses another or a card', () => {
    oneLaneNothingCrossing(lane, twoRows, TWO_Y);
  });

  test('legs above and below the lane never meet in one line across it', () => {
    const xs = (above: boolean): Set<number> =>
      new Set(
        lane.paths.flatMap(path =>
          segments(path.d)
            .filter(s => !horizontal(s) && Math.min(s.y1, s.y2) < TWO_Y === above)
            .map(s => s.x1)
        )
      );
    const above = xs(true);
    for (const x of xs(false)) expect(above.has(x)).toBe(false);
  });

  test("legs keep to a card's outer quarters, leaving its middle half to forward hand-offs", () => {
    for (const path of lane.paths) {
      for (const s of segments(path.d).filter(seg => !horizontal(seg))) {
        const card = [...twoRows.values()].find(c => s.x1 >= c.box.x && s.x1 <= c.box.x + c.box.w);
        const at = (s.x1 - (card?.box.x ?? 0)) / CARD_W;
        expect(at < 0.25 || at > 0.75).toBe(true);
      }
    }
  });
});
