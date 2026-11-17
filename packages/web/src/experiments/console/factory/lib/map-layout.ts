/**
 * Where the factory map draws its cards and arrows, in world units (px at zoom 1), from the
 * declaration's `map` block only: cards on its 1-based grid, forward arrows between card
 * sides, back arrows (returns) dropped into lanes below the cards so none overlap.
 */
import type { Declaration } from './board';

type MapBlock = Declaration['map'];
type MapArrow = MapBlock['arrows'][number];

/*
 * Sized so the map reads at the console's smallest type step when fitted at 1440x900: the
 * Overview's frame is about 1100px wide, a row of seven columns is 6 * COL_PITCH + CARD_W =
 * 1716 wide, so it fits at about 0.61 and the cards' 15px text draws at about 9.2px. Taller
 * cards cost nothing there, since the fit is limited by width: they hold a whole blurb.
 */
export const CARD_W = 180;
export const CARD_H = 184;
/** Room between columns for a forward arrow and its one-word label at 15px. */
export const COL_PITCH = 256;
export const ROW_PITCH = 232;
/** Vertical distance between back-arrow lanes, and from the cards to the first lane. */
export const LANE = 26;
/** Half the height a label takes, so bounds include labels drawn on a lane. */
const LABEL_HALF = 10;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface ArrowPath {
  from: string;
  to: string;
  label: string | undefined;
  back: boolean;
  /** The SVG path, ending where the arrowhead points. */
  d: string;
  /** Where the label's centre goes. */
  labelAt: Point;
  /** A back arrow's lane below the cards, 0 nearest; undefined for a forward arrow. */
  lane: number | undefined;
}

/** Each card's box, by stage id. A stage with no card has no box. */
export function cardBoxes(map: MapBlock): Map<string, Box> {
  return new Map(
    map.cards.map(card => [
      card.stage,
      { x: (card.col - 1) * COL_PITCH, y: (card.row - 1) * ROW_PITCH, w: CARD_W, h: CARD_H },
    ])
  );
}

const centreX = (box: Box): number => box.x + box.w / 2;
const centreY = (box: Box): number => box.y + box.h / 2;
const bottom = (box: Box): number => box.y + box.h;

/** A forward arrow: side to side in one row, an elbow across rows, bottom to top in one column. */
function forwardPath(a: Box, b: Box): { d: string; labelAt: Point } {
  if (a.x === b.x) {
    const down = b.y > a.y;
    const y1 = down ? bottom(a) : a.y;
    const y2 = down ? b.y : bottom(b);
    const x = centreX(a);
    return { d: `M${x},${y1} V${y2}`, labelAt: { x: x + 6, y: (y1 + y2) / 2 } };
  }
  const right = b.x > a.x;
  const x1 = right ? a.x + a.w : a.x;
  const x2 = right ? b.x : b.x + b.w;
  const y1 = centreY(a);
  const y2 = centreY(b);
  const midX = (x1 + x2) / 2;
  const d = y1 === y2 ? `M${x1},${y1} H${x2}` : `M${x1},${y1} H${midX} V${y2} H${x2}`;
  return { d, labelAt: { x: midX, y: Math.min(y1, y2) - 11 } };
}

interface Back {
  index: number;
  arrow: MapArrow;
  a: Box;
  b: Box;
  lo: number;
  hi: number;
}

/**
 * A lane per back arrow, shortest span first: an arrow takes the nearest lane no arrow whose
 * horizontal run overlaps its own already holds, so nested returns stack outward.
 */
function assignLanes(backs: readonly Back[]): Map<number, number> {
  const lanes = new Map<number, number>();
  const taken: { lo: number; hi: number; lane: number }[] = [];
  const bySpan = [...backs].sort((p, q) => p.hi - p.lo - (q.hi - q.lo) || p.index - q.index);
  for (const back of bySpan) {
    let lane = 0;
    while (taken.some(t => t.lane === lane && t.lo <= back.hi && back.lo <= t.hi)) lane += 1;
    taken.push({ lo: back.lo, hi: back.hi, lane });
    lanes.set(back.index, lane);
  }
  return lanes;
}

/**
 * Where each back arrow meets each card's bottom edge. A card's attachments spread across
 * its bottom, ordered so lines do not cross: those whose other end lies left come first,
 * the farthest of them innermost; then those whose other end lies right, the farthest outermost.
 */
function ports(backs: readonly Back[], boxes: ReadonlyMap<string, Box>): Map<string, number> {
  const at = new Map<string, { key: string; other: number }[]>();
  const attach = (stage: string, key: string, other: Box): void => {
    const list = at.get(stage) ?? [];
    list.push({ key, other: centreX(other) });
    at.set(stage, list);
  };
  for (const back of backs) {
    attach(back.arrow.from, `${back.index.toString()}:from`, back.b);
    attach(back.arrow.to, `${back.index.toString()}:to`, back.a);
  }
  const xs = new Map<string, number>();
  for (const [stage, list] of at) {
    const box = boxes.get(stage);
    if (box === undefined) continue;
    const self = centreX(box);
    const side = (other: number): number => (other < self ? 0 : 1);
    list.sort((p, q) => side(p.other) - side(q.other) || q.other - p.other);
    // The middle half of the bottom edge, so a line never runs down a card's corner.
    const step = box.w / 2 / (list.length + 1);
    list.forEach((entry, i) => xs.set(entry.key, box.x + box.w / 4 + step * (i + 1)));
  }
  return xs;
}

/** Every declared arrow whose ends both have cards, in declaration order. */
export function arrowPaths(map: MapBlock, boxes: ReadonlyMap<string, Box>): ArrowPath[] {
  const placed = map.arrows.flatMap((arrow, index) => {
    const a = boxes.get(arrow.from);
    const b = boxes.get(arrow.to);
    return a === undefined || b === undefined ? [] : [{ index, arrow, a, b }];
  });
  const backs: Back[] = placed
    .filter(entry => entry.arrow.back === true)
    .map(entry => ({
      ...entry,
      lo: Math.min(centreX(entry.a), centreX(entry.b)),
      hi: Math.max(centreX(entry.a), centreX(entry.b)),
    }));
  const lanes = assignLanes(backs);
  const xs = ports(backs, boxes);
  return placed.map(({ index, arrow, a, b }): ArrowPath => {
    const common = { from: arrow.from, to: arrow.to, label: arrow.label };
    const lane = lanes.get(index);
    if (lane === undefined)
      return { ...common, back: false, lane: undefined, ...forwardPath(a, b) };
    const x1 = xs.get(`${index.toString()}:from`) ?? centreX(a);
    const x2 = xs.get(`${index.toString()}:to`) ?? centreX(b);
    const y = Math.max(bottom(a), bottom(b)) + LANE * (lane + 1);
    return {
      ...common,
      back: true,
      lane,
      d: `M${x1},${bottom(a)} V${y} H${x2} V${bottom(b)}`,
      labelAt: { x: (x1 + x2) / 2, y },
    };
  });
}

/** The box holding every card, arrow and label; empty at the origin when there are no cards. */
export function mapBounds(boxes: ReadonlyMap<string, Box>, arrows: readonly ArrowPath[]): Box {
  const all = [...boxes.values()];
  if (all.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...all.map(box => box.x));
  const right = Math.max(...all.map(box => box.x + box.w));
  const labelTops = arrows.map(arrow => arrow.labelAt.y - LABEL_HALF);
  const top = Math.min(...all.map(box => box.y), ...labelTops);
  const lowest = Math.max(...all.map(bottom), ...arrows.map(arrow => arrow.labelAt.y + LABEL_HALF));
  return { x: left, y: top, w: right - left, h: lowest - top };
}
