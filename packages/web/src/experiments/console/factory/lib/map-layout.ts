/**
 * Where the factory map draws its cards and arrows, in world units (px at zoom 1), from the
 * declaration's `map` block only: cards on its 1-based grid, arrows within a row from side to
 * side, arrows within a column straight down, and every other arrow (every return, and a
 * hand-off to another row and column) in a lane of the gap below the upper of its two rows, so
 * no arrow runs through a card. Each gap grows with the lanes it carries.
 *
 * Known limit: an arrow between rows more than one apart drops through the rows between.
 */
import type { FactoryViewListed } from './views';

type MapBlock = FactoryViewListed['declaration']['map'];
type MapArrow = MapBlock['arrows'][number];

/*
 * Sized so a four-column row fits the Overview's frame (about 1100px wide at 1440x900) at
 * k = 1: 3 * COL_PITCH + CARD_W = 948, so titles draw at about 17px and blurbs, chips and
 * labels at about 15px, legible on a projected screen. A wider grid fits smaller, down to READABLE_K
 * (map-camera.ts); the declaration's author picks the grid. Taller cards cost nothing there,
 * since the fit is limited by width: they hold a whole blurb.
 */
export const CARD_W = 180;
export const CARD_H = 184;
/** Room between columns for a forward arrow and its one-word label at 15px. */
export const COL_PITCH = 256;
/** The least room between rows, for a column arrow and its label. */
export const ROW_GAP = 48;
/** Vertical distance between lanes in a gap, and from the upper row to the first lane. */
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
  /** A lane arrow's lane in the gap below the upper of its rows, 0 nearest; else undefined. */
  lane: number | undefined;
}

export interface MapLayout {
  /** Each card's box, by stage id. A stage with no card has no box. */
  boxes: Map<string, Box>;
  /** Every declared arrow whose ends both have cards, in declaration order. */
  arrows: ArrowPath[];
  /** The box holding every card, arrow and label; empty at the origin when there are no cards. */
  bounds: Box;
}

interface Card {
  stage: string;
  col: number;
  row: number;
}

interface Placed {
  index: number;
  arrow: MapArrow;
  a: Card;
  b: Card;
}

/** A lane arrow: its gap (the row above it), its run between the card centres, and its lane. */
interface Laned extends Placed {
  gap: number;
  lo: number;
  hi: number;
}

const colX = (col: number): number => (col - 1) * COL_PITCH;
const centreX = (box: Box): number => box.x + box.w / 2;
const centreY = (box: Box): number => box.y + box.h / 2;
const bottom = (box: Box): number => box.y + box.h;

/** Side to side within a row, straight down or up within a column; else it takes a lane. */
const kindOf = (entry: Placed): 'side' | 'column' | 'lane' => {
  if (entry.arrow.back === true) return 'lane';
  if (entry.a.row === entry.b.row) return 'side';
  return entry.a.col === entry.b.col ? 'column' : 'lane';
};

/**
 * A lane per arrow within one gap, shortest span first: an arrow takes the nearest lane no
 * arrow whose horizontal run overlaps its own already holds, so nested runs stack outward.
 */
function assignLanes(laned: readonly Laned[]): Map<number, number> {
  const lanes = new Map<number, number>();
  const taken: { lo: number; hi: number; lane: number }[] = [];
  const bySpan = [...laned].sort((p, q) => p.hi - p.lo - (q.hi - q.lo) || p.index - q.index);
  for (const entry of bySpan) {
    let lane = 0;
    while (taken.some(t => t.lane === lane && t.lo <= entry.hi && entry.lo <= t.hi)) lane += 1;
    taken.push({ lo: entry.lo, hi: entry.hi, lane });
    lanes.set(entry.index, lane);
  }
  return lanes;
}

/** Each gap's lanes, run once per gap over that gap's arrows only. */
function lanesByGap(laned: readonly Laned[]): Map<number, number> {
  const lanes = new Map<number, number>();
  for (const gap of new Set(laned.map(entry => entry.gap))) {
    const inGap = laned.filter(entry => entry.gap === gap);
    for (const [index, lane] of assignLanes(inGap)) lanes.set(index, lane);
  }
  return lanes;
}

/** Each row's top: a gap is ROW_GAP, or room for its lanes and one more, whichever is more. */
function rowTops(
  cards: readonly Card[],
  laned: readonly Laned[],
  lanes: ReadonlyMap<number, number>
): number[] {
  const rows = Math.max(0, ...cards.map(card => card.row));
  const lanesIn = (row: number): number =>
    Math.max(
      0,
      ...laned.filter(entry => entry.gap === row).map(entry => (lanes.get(entry.index) ?? 0) + 1)
    );
  const tops = [0];
  for (let row = 1; row < rows; row += 1) {
    tops.push((tops[row - 1] ?? 0) + CARD_H + Math.max(ROW_GAP, (lanesIn(row) + 1) * LANE));
  }
  return tops;
}

/**
 * Where each lane arrow meets a card edge: the upper card's bottom, the lower card's top, and
 * both bottoms for a return within a row. A card's attachments on an edge spread over the
 * middle half, off its exact centre (a column arrow's), those whose other end lies left on the
 * left. They are ordered by lane so lines do not cross: on a bottom edge the deeper lane runs
 * nearer the centre, on a top edge (where the deeper lane is nearer the card) nearer the corner.
 */
function ports(
  laned: readonly Laned[],
  lanes: ReadonlyMap<number, number>,
  boxes: ReadonlyMap<string, Box>
): Map<string, number> {
  const at = new Map<string, { key: string; other: number; lane: number }[]>();
  const attach = (self: Card, other: Card, key: string, lane: number): void => {
    const edge = self.row > other.row ? 'top' : 'bottom';
    const list = at.get(`${self.stage}:${edge}`) ?? [];
    list.push({ key, other: colX(other.col), lane });
    at.set(`${self.stage}:${edge}`, list);
  };
  for (const entry of laned) {
    const lane = lanes.get(entry.index) ?? 0;
    attach(entry.a, entry.b, `${entry.index.toString()}:from`, lane);
    attach(entry.b, entry.a, `${entry.index.toString()}:to`, lane);
  }
  const xs = new Map<string, number>();
  for (const [where, list] of at) {
    const [stage, edge] = where.split(':');
    const box = stage === undefined ? undefined : boxes.get(stage);
    if (box === undefined) continue;
    // Left of centre runs outward-in, right of centre inward-out; a top edge reverses both.
    const inward = edge === 'bottom' ? 1 : -1;
    const left = list
      .filter(entry => entry.other < box.x)
      .sort((p, q) => inward * (p.lane - q.lane));
    const right = list
      .filter(entry => entry.other >= box.x)
      .sort((p, q) => inward * (q.lane - p.lane));
    const spread = (group: typeof list, start: number): void => {
      const step = box.w / 4 / (group.length + 1);
      group.forEach((entry, i) => xs.set(entry.key, start + step * (i + 1)));
    };
    spread(left, box.x + box.w / 4);
    spread(right, box.x + box.w / 2);
  }
  return xs;
}

/** A side or column arrow: side to side in one row, edge to edge down or up one column. */
function straightPath(a: Box, b: Box): { d: string; labelAt: Point } {
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
  const y = centreY(a);
  return { d: `M${x1},${y} H${x2}`, labelAt: { x: (x1 + x2) / 2, y: y - 11 } };
}

/** A lane arrow: out of its edge, along its lane, into the other card's edge. */
function lanePath(
  entry: Laned,
  a: Box,
  b: Box,
  lane: number,
  xs: ReadonlyMap<string, number>
): { d: string; labelAt: Point } {
  const upper = entry.a.row <= entry.b.row ? a : b;
  const y = bottom(upper) + LANE * (lane + 1);
  const edge = (card: Card, other: Card, box: Box): number =>
    card.row > other.row ? box.y : bottom(box);
  const x1 = xs.get(`${entry.index.toString()}:from`) ?? centreX(a);
  const x2 = xs.get(`${entry.index.toString()}:to`) ?? centreX(b);
  return {
    d: `M${x1},${edge(entry.a, entry.b, a)} V${y} H${x2} V${edge(entry.b, entry.a, b)}`,
    labelAt: { x: (x1 + x2) / 2, y },
  };
}

function boundsOf(boxes: readonly Box[], arrows: readonly ArrowPath[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map(box => box.x));
  const right = Math.max(...boxes.map(box => box.x + box.w));
  const top = Math.min(
    ...boxes.map(box => box.y),
    ...arrows.map(arrow => arrow.labelAt.y - LABEL_HALF)
  );
  const lowest = Math.max(
    ...boxes.map(bottom),
    ...arrows.map(arrow => arrow.labelAt.y + LABEL_HALF)
  );
  return { x: left, y: top, w: right - left, h: lowest - top };
}

/** The map's cards, arrows and bounds, laid out from its declared grid. */
export function layoutMap(map: MapBlock): MapLayout {
  const cards = new Map(map.cards.map(card => [card.stage, card]));
  const placed: Placed[] = map.arrows.flatMap((arrow, index) => {
    const a = cards.get(arrow.from);
    const b = cards.get(arrow.to);
    return a === undefined || b === undefined ? [] : [{ index, arrow, a, b }];
  });
  const laned: Laned[] = placed
    .filter(entry => kindOf(entry) === 'lane')
    .map(entry => ({
      ...entry,
      gap: Math.min(entry.a.row, entry.b.row),
      lo: Math.min(entry.a.col, entry.b.col) * COL_PITCH,
      hi: Math.max(entry.a.col, entry.b.col) * COL_PITCH,
    }));
  const lanes = lanesByGap(laned);
  const tops = rowTops(map.cards, laned, lanes);
  const boxes = new Map(
    map.cards.map(card => [
      card.stage,
      { x: colX(card.col), y: tops[card.row - 1] ?? 0, w: CARD_W, h: CARD_H },
    ])
  );
  const xs = ports(laned, lanes, boxes);
  const box = (card: Card): Box => boxes.get(card.stage) ?? { x: 0, y: 0, w: 0, h: 0 };
  const lanedAt = new Map(laned.map(entry => [entry.index, entry]));
  const arrows = placed.map((entry): ArrowPath => {
    const { from, to, label } = entry.arrow;
    const common = { from, to, label, back: entry.arrow.back === true };
    const lane = lanes.get(entry.index);
    const inLane = lanedAt.get(entry.index);
    if (lane === undefined || inLane === undefined)
      return { ...common, lane: undefined, ...straightPath(box(entry.a), box(entry.b)) };
    return { ...common, lane, ...lanePath(inLane, box(entry.a), box(entry.b), lane, xs) };
  });
  return { boxes, arrows, bounds: boundsOf([...boxes.values()], arrows) };
}
