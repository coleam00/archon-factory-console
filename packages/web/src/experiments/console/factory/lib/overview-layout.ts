/**
 * Where the factory overview draws one view, in world units (px at zoom 1). It routes edges
 * by the rules the overview schema checks on the grid (`factory-overview-geometry.ts` in
 * `@archon/workflows`): a `feeds` or `calls` edge runs straight along the middle row (else
 * column) its two ends share, from side to facing side; the one `loops-back` edge drops from
 * the bottom of its source into a lane under every box, runs along it, and rises into the
 * bottom of its target. A file the server lists has passed those rules, so nothing drawn here
 * crosses; `overview-layout.test.ts` checks this drawing of the shipped file to keep the two
 * in step.
 */
import type { Box, Point } from './map-layout';
import type { OverviewView } from './overview-nav';

/*
 * Sized for a projector: the root view of eight columns fits the page's map frame at 1440x900
 * with titles at OVERVIEW_TITLE_PX * k >= 14 px (the test measures it). A card is about six
 * title widths wide, so a two-word title wraps; the height holds three lines of title and of
 * text, and costs nothing, since the root's fit is limited by its width.
 */
export const OVERVIEW_CARD_W = 196;
export const OVERVIEW_CARD_H = 336;
export const OVERVIEW_GAP_X = 48;
/** Room between rows for a column edge and its label. */
export const OVERVIEW_GAP_Y = 56;
/** How far a group's box reaches past its cards: under half of either gap, so it never touches a neighbour. */
export const OVERVIEW_GROUP_PAD = 20;
/** How far under the lowest box the loops-back lane runs. */
export const OVERVIEW_LANE_BELOW = 64;
/** A card title's size in world px (`text-console-34`); the fit test holds it to 14 px drawn. */
export const OVERVIEW_TITLE_PX = 34;
/**
 * The tallest the map frame grows on the page, so a tall drill-down fits in one screen at
 * 1440x900 instead of scrolling; full screen it fills the screen instead.
 */
export const OVERVIEW_PAGE_MAX_H = 640;
/** Half a label's height, so bounds include a label drawn on the lane. */
const LABEL_HALF = 14;

type EdgeKind = OverviewView['edges'][number]['kind'];

export interface OverviewEdgePath {
  from: string;
  to: string;
  kind: EdgeKind;
  label: string | undefined;
  /** From the source to the target. */
  points: Point[];
  /** Where the label's centre sits, and on which side of the line. */
  labelAt: Point;
  labelSide: 'above' | 'right' | 'on';
}

export interface OverviewLayout {
  cards: Map<string, Box>;
  groups: Map<string, Box>;
  edges: OverviewEdgePath[];
  bounds: Box;
}

interface Span {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

const colX = (col: number): number => (col - 1) * (OVERVIEW_CARD_W + OVERVIEW_GAP_X);
const rowY = (row: number): number => (row - 1) * (OVERVIEW_CARD_H + OVERVIEW_GAP_Y);

function spanBox(span: Span, pad: number): Box {
  const x = colX(span.c0) - pad;
  const y = rowY(span.r0) - pad;
  return {
    x,
    y,
    w: colX(span.c1) + OVERVIEW_CARD_W + pad - x,
    h: rowY(span.r1) + OVERVIEW_CARD_H + pad - y,
  };
}

/** The middle of the shared cells `lo..hi`, as the schema picks it. */
const middle = (lo: number, hi: number): number => Math.floor((lo + hi) / 2);

interface End {
  span: Span;
  box: Box;
}

/** A straight edge's two points, or undefined for ends the schema would have refused. */
function straight(a: End, b: End): [Point, Point] | undefined {
  const rowLo = Math.max(a.span.r0, b.span.r0);
  const rowHi = Math.min(a.span.r1, b.span.r1);
  if (rowLo <= rowHi) {
    const y = rowY(middle(rowLo, rowHi)) + OVERVIEW_CARD_H / 2;
    const aLeft = a.box.x < b.box.x;
    const ax = aLeft ? a.box.x + a.box.w : a.box.x;
    const bx = aLeft ? b.box.x : b.box.x + b.box.w;
    return [
      { x: ax, y },
      { x: bx, y },
    ];
  }
  const colLo = Math.max(a.span.c0, b.span.c0);
  const colHi = Math.min(a.span.c1, b.span.c1);
  if (colLo > colHi) return undefined;
  const x = colX(middle(colLo, colHi)) + OVERVIEW_CARD_W / 2;
  const aAbove = a.box.y < b.box.y;
  const ay = aAbove ? a.box.y + a.box.h : a.box.y;
  const by = aAbove ? b.box.y : b.box.y + b.box.h;
  return [
    { x, y: ay },
    { x, y: by },
  ];
}

/** Every card and group of `view` as an edge end. */
function endsOf(view: OverviewView): Map<string, End> {
  const ends = new Map<string, End>();
  for (const card of view.cards) {
    const span = { c0: card.col, c1: card.col, r0: card.row, r1: card.row };
    ends.set(card.id, { span, box: spanBox(span, 0) });
  }
  for (const group of view.groups ?? []) {
    const members = view.cards.filter(card => card.group === group.id);
    if (members.length === 0) continue;
    const span = {
      c0: Math.min(...members.map(card => card.col)),
      c1: Math.max(...members.map(card => card.col)),
      r0: Math.min(...members.map(card => card.row)),
      r1: Math.max(...members.map(card => card.row)),
    };
    ends.set(group.id, { span, box: spanBox(span, OVERVIEW_GROUP_PAD) });
  }
  return ends;
}

const bottomCentre = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h });

/** One edge's path, or undefined for one the schema would have refused. */
function edgePath(
  edge: OverviewView['edges'][number],
  ends: Map<string, End>,
  laneY: number
): OverviewEdgePath | undefined {
  const from = ends.get(edge.from);
  const to = ends.get(edge.to);
  if (from === undefined || to === undefined) return undefined;
  const base = { from: edge.from, to: edge.to, kind: edge.kind, label: edge.label };
  if (edge.kind === 'loops-back') {
    const start = bottomCentre(from.box);
    const end = bottomCentre(to.box);
    return {
      ...base,
      points: [start, { x: start.x, y: laneY }, { x: end.x, y: laneY }, end],
      labelAt: { x: (start.x + end.x) / 2, y: laneY },
      labelSide: 'on',
    };
  }
  const points = straight(from, to);
  if (points === undefined) return undefined;
  const [a, b] = points;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { ...base, points, labelAt: mid, labelSide: a.y === b.y ? 'above' : 'right' };
}

/** The layout of one view: its cards, groups and edges, and the box around all of them. */
export function layoutOverview(view: OverviewView): OverviewLayout {
  const ends = endsOf(view);
  const cards = new Map(view.cards.map(card => [card.id, (ends.get(card.id) as End).box]));
  const groups = new Map<string, Box>();
  for (const group of view.groups ?? []) {
    const end = ends.get(group.id);
    if (end !== undefined) groups.set(group.id, end.box);
  }
  const boxes = [...ends.values()].map(end => end.box);
  const lowest = Math.max(...boxes.map(box => box.y + box.h));
  const laneY = lowest + OVERVIEW_LANE_BELOW;
  const edges = view.edges.flatMap(edge => edgePath(edge, ends, laneY) ?? []);
  const hasLane = edges.some(edge => edge.kind === 'loops-back');
  const left = Math.min(...boxes.map(box => box.x));
  // A group's label sits on its top border, half above it.
  const top = Math.min(
    ...view.cards.map(card => (cards.get(card.id) as Box).y),
    ...[...groups.values()].map(box => box.y - LABEL_HALF)
  );
  const right = Math.max(...boxes.map(box => box.x + box.w));
  const bottom = hasLane ? laneY + LABEL_HALF : lowest;
  return { cards, groups, edges, bounds: { x: left, y: top, w: right - left, h: bottom - top } };
}
