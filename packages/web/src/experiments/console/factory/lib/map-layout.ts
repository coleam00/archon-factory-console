/**
 * Where the factory map draws its cards and arrows, in world units (px at zoom 1). The cards
 * are the stages the declaration gives a `map` card, in `stages` order (the board's), in one
 * row left to right; or in two, the first half above, when the frame is too narrow for one
 * row at a readable size (`rowsFor` in map-camera.ts). The arrows are the view file's
 * `map.arrows` and no others, in two kinds:
 *
 * - A forward hand-off runs side to side between cards next to each other in a row. One that
 *   skips cards runs in a lane off the row's outer edge; one between the two rows, in a lane
 *   of the gap between them. Lanes are shared by arrows whose runs do not overlap.
 * - Every send-back (an arrow into its own card or one earlier in `stages` order) is drawn in
 *   the one feedback lane (`map-feedback-lane.ts`):
 *   under the row, or in the gap below the forward lanes there.
 *
 * Known limit: with two rows, a forward hand-off between the rows crosses the feedback lane,
 * and a send-back leg from the upper row crosses the forward lanes, both at right angles.
 */
import {
  feedbackLane,
  laneLabelRoom,
  type LaneCard,
  type LanePath,
  type LaneLabel,
  type SendBack,
} from './map-feedback-lane';
import { CARD_H, CARD_W, COL_PITCH, LANE, ROW_GAP } from './map-sizes';
import type { FactoryViewListed } from './views';

export { CARD_H, CARD_W, COL_PITCH, LANE, ROW_GAP } from './map-sizes';

type Declaration = FactoryViewListed['declaration'];

/** A declared arrow, or several forward ones between one pair of cards merged. */
interface Drawn extends SendBack {
  /** A send-back: drawn in the feedback lane. */
  back: boolean;
}

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

/** A forward hand-off. */
export interface ArrowPath extends Drawn {
  /** The SVG path, ending where the arrowhead points. */
  d: string;
  /** Where the label's centre goes. */
  labelAt: Point;
  /** A lane arrow's lane, 0 nearest its row; undefined for one side to side. */
  lane: number | undefined;
}

export interface MapLayout {
  /** Each card's box, by stage id. A stage with no card has no box. */
  boxes: Map<string, Box>;
  /** How many rows the cards take. */
  rows: 1 | 2;
  /** Every forward hand-off between two cards, in declared order. */
  arrows: ArrowPath[];
  /** Every send-back, in the one feedback lane, and one label per target. */
  feedback: { paths: LanePath[]; labels: LaneLabel[] };
  /** The box holding every card, arrow and label; empty at the origin when there are no cards. */
  bounds: Box;
}

interface Card {
  stage: string;
  /** Its place in `stages` order. */
  pos: number;
  row: 0 | 1;
  col: number;
}

/**
 * Where a forward lane runs: `above` the first row or `below` the second (a hand-off that
 * skips cards in its row), or in the `gap` between the rows.
 */
type Region = 'above' | 'gap' | 'below';

interface Placed {
  index: number;
  arrow: Drawn;
  a: Card;
  b: Card;
}

interface Laned extends Placed {
  region: Region;
  lo: number;
  hi: number;
}

const colX = (col: number): number => col * COL_PITCH;
const centreY = (box: Box): number => box.y + box.h / 2;
const bottom = (box: Box): number => box.y + box.h;

/** The stages with a card, in `stages` order, one row or two. */
function placeCards(view: Declaration, rows: 1 | 2): Card[] {
  const carded = new Set(view.map.cards.map(card => card.stage));
  const ordered = view.stages.filter(stage => carded.has(stage.id));
  const perRow = rows === 1 ? ordered.length : Math.ceil(ordered.length / 2);
  return ordered.map((stage, pos) => {
    const row = pos < perRow ? 0 : 1;
    return { stage: stage.id, pos, row, col: row === 0 ? pos : pos - perRow };
  });
}

/**
 * The declared arrows between two cards. The direction comes from `stages` order alone: an
 * arrow into its own card or an earlier one is a send-back. The view file's `back` flag is
 * ignored, since a second statement of direction could only disagree with that order.
 */
function drawnArrows(map: Declaration['map'], cards: ReadonlyMap<string, Card>): Drawn[] {
  const drawn = map.arrows
    .map(
      (arrow, index): Drawn => ({
        id: `decl:${index.toString()}`,
        from: arrow.from,
        to: arrow.to,
        label: arrow.label,
        back: (cards.get(arrow.to)?.pos ?? 0) <= (cards.get(arrow.from)?.pos ?? 0),
      })
    )
    .filter(arrow => cards.has(arrow.from) && cards.has(arrow.to));
  return mergeForward(drawn);
}

/**
 * Forward arrows between one pair of cards as one, at the first's place, their outcomes
 * joined, each once: two would draw one line with their labels on one point. Send-backs stay
 * one each; the feedback lane joins their outcomes per target.
 */
function mergeForward(drawn: readonly Drawn[]): Drawn[] {
  const merged: Drawn[] = [];
  const byPair = new Map<string, Drawn>();
  for (const arrow of drawn) {
    const pair = `${arrow.from} -> ${arrow.to}`;
    const first = arrow.back ? undefined : byPair.get(pair);
    if (first === undefined) {
      const copy = { ...arrow };
      if (!arrow.back) byPair.set(pair, copy);
      merged.push(copy);
      continue;
    }
    const parts = [first.label, arrow.label].flatMap(label => label?.split(', ') ?? []);
    first.label = parts.length === 0 ? undefined : [...new Set(parts)].join(', ');
  }
  return merged;
}

/** Undefined for a forward hand-off side to side; else where its lane runs. */
function regionOf(entry: Placed): Region | undefined {
  if (entry.a.row !== entry.b.row) return 'gap';
  if (Math.abs(entry.a.col - entry.b.col) === 1) return undefined;
  return entry.a.row === 0 ? 'above' : 'below';
}

/**
 * A lane per arrow within one region, shortest span first: an arrow takes the nearest lane no
 * arrow whose run overlaps its own already holds, so nested runs stack outward.
 */
function assignLanes(laned: readonly Laned[]): Map<number, number> {
  const lanes = new Map<number, number>();
  const taken: { region: Region; lo: number; hi: number; lane: number }[] = [];
  const bySpan = [...laned].sort((p, q) => p.hi - p.lo - (q.hi - q.lo) || p.index - q.index);
  for (const entry of bySpan) {
    let lane = 0;
    while (
      taken.some(
        t => t.region === entry.region && t.lane === lane && t.lo <= entry.hi && entry.lo <= t.hi
      )
    )
      lane += 1;
    taken.push({ region: entry.region, lo: entry.lo, hi: entry.hi, lane });
    lanes.set(entry.index, lane);
  }
  return lanes;
}

/** How many lanes a region's arrows take. */
const lanesIn = (laned: readonly Laned[], lanes: ReadonlyMap<number, number>, region: Region) =>
  Math.max(0, ...laned.filter(e => e.region === region).map(e => (lanes.get(e.index) ?? 0) + 1));

/** The edge of `self` a lane arrow in `region` meets: the lower row's top in the gap. */
const edgeOf = (self: Card, region: Region): 'top' | 'bottom' =>
  region === 'above' || (region === 'gap' && self.row === 1) ? 'top' : 'bottom';

/** The y of a lane: off the row's outer edge, or down from the upper row into the gap. */
function laneY(region: Region, lane: number, row2Top: number): number {
  if (region === 'above') return -LANE * (lane + 1);
  if (region === 'below') return row2Top + CARD_H + LANE * (lane + 1);
  return CARD_H + LANE * (lane + 1);
}

/**
 * Where each lane arrow meets a card edge, keyed `<index>:from` and `<index>:to`. A card's
 * attachments on an edge spread over its middle half (the feedback lane's legs keep to the
 * outer quarters), those whose other end lies left on the left, and in lane order so lines
 * leaving one edge do not cross: where the deeper lane runs farther from the edge, nearer the
 * centre; on the lower row's top edge, where it runs nearer, nearer the corner.
 */
function ports(laned: readonly Laned[], lanes: ReadonlyMap<number, number>): Map<string, number> {
  const at = new Map<string, { key: string; self: Card; other: number; lane: number }[]>();
  const attach = (self: Card, other: Card, region: Region, key: string, lane: number): void => {
    const where = `${self.stage}:${edgeOf(self, region)}:${region}`;
    const list = at.get(where) ?? [];
    list.push({ key, self, other: colX(other.col), lane });
    at.set(where, list);
  };
  for (const entry of laned) {
    const lane = lanes.get(entry.index) ?? 0;
    attach(entry.a, entry.b, entry.region, `${entry.index.toString()}:from`, lane);
    attach(entry.b, entry.a, entry.region, `${entry.index.toString()}:to`, lane);
  }
  const xs = new Map<string, number>();
  for (const [where, list] of at) {
    const self = list[0]?.self;
    if (self === undefined) continue;
    const x = colX(self.col);
    const inward = where.endsWith(':gap') && self.row === 1 ? -1 : 1;
    const left = list.filter(e => e.other < x).sort((p, q) => inward * (p.lane - q.lane));
    const right = list.filter(e => e.other >= x).sort((p, q) => inward * (q.lane - p.lane));
    const spread = (group: typeof list, start: number): void => {
      const step = CARD_W / 4 / (group.length + 1);
      group.forEach((entry, i) => xs.set(entry.key, start + step * (i + 1)));
    };
    spread(left, x + CARD_W / 4);
    spread(right, x + CARD_W / 2);
  }
  return xs;
}

/** Side to side in one row, between cards next to each other. */
function sidePath(a: Box, b: Box): { d: string; labelAt: Point } {
  const right = b.x > a.x;
  const x1 = right ? a.x + a.w : a.x;
  const x2 = right ? b.x : b.x + b.w;
  const y = centreY(a);
  return { d: `M${x1},${y} H${x2}`, labelAt: { x: (x1 + x2) / 2, y: y - 11 } };
}

/** The forward hand-offs that take a lane, and their lanes: these depend on columns only. */
function laneForward(forward: readonly Placed[]): { laned: Laned[]; lanes: Map<number, number> } {
  const laned = forward.flatMap((entry): Laned[] => {
    const region = regionOf(entry);
    if (region === undefined) return [];
    const [lo, hi] = [entry.a.col, entry.b.col].sort((p, q) => p - q) as [number, number];
    return [{ ...entry, region, lo: lo * COL_PITCH, hi: hi * COL_PITCH }];
  });
  return { laned, lanes: assignLanes(laned) };
}

/** The forward hand-offs: side to side, or out of an edge, along a lane, into an edge. */
function forwardPaths(
  forward: readonly Placed[],
  { laned, lanes }: { laned: readonly Laned[]; lanes: ReadonlyMap<number, number> },
  boxes: ReadonlyMap<string, Box>,
  row2Top: number
): ArrowPath[] {
  const xs = ports(laned, lanes);
  const regions = new Map(laned.map(entry => [entry.index, entry.region]));
  const box = (card: Card): Box => boxes.get(card.stage) ?? { x: 0, y: 0, w: 0, h: 0 };
  return forward.map((entry): ArrowPath => {
    const region = regions.get(entry.index);
    const lane = lanes.get(entry.index);
    if (region === undefined || lane === undefined)
      return { ...entry.arrow, lane: undefined, ...sidePath(box(entry.a), box(entry.b)) };
    const y = laneY(region, lane, row2Top);
    const edge = (card: Card): number =>
      edgeOf(card, region) === 'top' ? box(card).y : bottom(box(card));
    const x1 = xs.get(`${entry.index.toString()}:from`) ?? 0;
    const x2 = xs.get(`${entry.index.toString()}:to`) ?? 0;
    return {
      ...entry.arrow,
      lane,
      d: `M${x1},${edge(entry.a)} V${y} H${x2} V${edge(entry.b)}`,
      labelAt: { x: (x1 + x2) / 2, y },
    };
  });
}

function boundsOf(boxes: readonly Box[], arrows: readonly ArrowPath[], extents: readonly Box[]) {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const all = [...boxes, ...extents];
  const left = Math.min(...all.map(box => box.x));
  const right = Math.max(...all.map(box => box.x + box.w));
  const top = Math.min(...all.map(box => box.y), ...arrows.map(a => a.labelAt.y - LABEL_HALF));
  const lowest = Math.max(...all.map(bottom), ...arrows.map(a => a.labelAt.y + LABEL_HALF));
  return { x: left, y: top, w: right - left, h: lowest - top };
}

/** The map's cards, arrows and bounds in `rows` rows. */
export function layoutMap(view: Declaration, rows: 1 | 2 = 1): MapLayout {
  const placed = placeCards(view, rows);
  const cards = new Map(placed.map(card => [card.stage, card]));
  const drawn = drawnArrows(view.map, cards);
  const sendBacks = drawn.filter(arrow => arrow.back);
  const forward = drawn.flatMap((arrow, index): Placed[] => {
    const a = cards.get(arrow.from);
    const b = cards.get(arrow.to);
    return arrow.back || a === undefined || b === undefined ? [] : [{ index, arrow, a, b }];
  });
  const { laned, lanes } = laneForward(forward);
  const feedbackY = CARD_H + LANE * (rows === 1 ? 1 : lanesIn(laned, lanes, 'gap') + 1);
  const row2Top =
    rows === 1 ? 0 : Math.max(CARD_H + ROW_GAP, feedbackY + laneLabelRoom(sendBacks) + LANE);
  const boxes = new Map(
    placed.map(card => [
      card.stage,
      { x: colX(card.col), y: card.row === 0 ? 0 : row2Top, w: CARD_W, h: CARD_H },
    ])
  );
  const arrows = forwardPaths(forward, { laned, lanes }, boxes, row2Top);
  const laneCards = new Map(
    placed.flatMap((card): [string, LaneCard][] => {
      const box = boxes.get(card.stage);
      if (box === undefined) return [];
      const side = rows === 1 ? 'one' : card.row === 0 ? 'upper' : 'lower';
      return [[card.stage, { box, side }]];
    })
  );
  const lane = feedbackLane(laneCards, feedbackY, sendBacks);
  const extents = lane.extent ? [lane.extent] : [];
  return {
    boxes,
    rows,
    arrows,
    feedback: { paths: lane.paths, labels: lane.labels },
    bounds: boundsOf([...boxes.values()], arrows, extents),
  };
}
