/**
 * Where the factory overview draws one view, in world units (px at zoom 1). It routes edges
 * by the rules the overview schema checks on the grid (`factory-overview-geometry.ts` in
 * `@archon/workflows`): a `feeds` or `calls` edge runs straight along the middle row (else
 * column) its two ends share, from side to facing side; the one `loops-back` edge drops from
 * the bottom of its source into a lane under every box, runs along it, and rises into the
 * bottom of its target. A file the server lists has passed those rules, so no edge drawn here
 * crosses. A parallel group (`parallelGroups`) also gets a fan on each side an edge meets it: a
 * bar along the frame and a stub to each member, drawn inside the group's pad, which no line
 * names a member to enter; `overview-layout.test.ts` checks the fans of the shipped file. Its
 * members draw at their content's height, centred on their rows, though edges route by the
 * full cell. The two copies of the rules cannot share a module (the web does not import
 * `@archon/workflows`); `scripts/overview-geometry-parity.test.ts` holds them in step on seeded
 * views, and `overview-layout.test.ts` checks this drawing of the shipped file.
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
/** The px a console type token names: `text-console-34` is 34 px (theme.css's scale). */
const tokenPx = (token: string): number => Number(token.slice('text-console-'.length));
/**
 * The card title's type token. The card draws it and the fit test measures the px it names,
 * so the 14 px floor holds for whatever size the card draws.
 */
export const OVERVIEW_TITLE_TEXT = 'text-console-34';
export const OVERVIEW_TITLE_PX = tokenPx(OVERVIEW_TITLE_TEXT);
/**
 * The type token of every other text the overview draws (card text, kind words, group and line
 * labels); the fit test holds the px it names to the console's type floor drawn.
 */
export const OVERVIEW_SMALL_TEXT = 'text-console-22';
export const OVERVIEW_SMALLEST_PX = tokenPx(OVERVIEW_SMALL_TEXT);
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

/**
 * Where a parallel group's edge branches to its members: a bar on the frame's side, spanning the
 * members' row centres, and a stub along each member's row between the bar and the card. Into
 * the group, the stubs run bar to card and carry the arrowheads; out of it, card to bar.
 */
export interface OverviewFan {
  group: string;
  kind: Exclude<EdgeKind, 'loops-back'>;
  side: 'left' | 'right';
  into: boolean;
  bar: [Point, Point];
  stubs: { card: string; from: Point; to: Point }[];
}

export interface OverviewLayout {
  /** Every card's grid cell; a parallel group's members draw smaller, centred in it. */
  cards: Map<string, Box>;
  groups: Map<string, Box>;
  edges: OverviewEdgePath[];
  bounds: Box;
  /** The cards that draw at their content's height: the members of a parallel group. */
  contentSized: Set<string>;
  fans: OverviewFan[];
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

/** Whether two ends share a cell: their boxes overlap. */
const spansOverlap = (a: Span, b: Span): boolean =>
  a.c0 <= b.c1 && b.c0 <= a.c1 && a.r0 <= b.r1 && b.r0 <= a.r1;

/** A straight edge's two points, or undefined for ends the schema would have refused. */
function straight(a: End, b: End): [Point, Point] | undefined {
  // Ends that overlap (a group and a card in it) have no line between them; the schema refuses them.
  if (spansOverlap(a.span, b.span)) return undefined;
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

const rowCentre = (row: number): number => rowY(row) + OVERVIEW_CARD_H / 2;

/**
 * The groups drawn as parallel: (a) two or more members, all in one column; (b) every edge that
 * names the group is a feeds or calls edge along a row; (c) no edge names a member. Rule (c) is
 * what lets a fan cross nothing: the only lines inside the group's pad are then its own edges,
 * which land on the frame's sides at a member's row (or between two), on the bar.
 */
export function parallelGroups(view: OverviewView): Set<string> {
  const ends = endsOf(view);
  const named = new Set(view.edges.flatMap(edge => [edge.from, edge.to]));
  const parallel = new Set<string>();
  for (const group of view.groups ?? []) {
    const members = view.cards.filter(card => card.group === group.id);
    const end = ends.get(group.id);
    if (end === undefined || members.length < 2 || end.span.c0 !== end.span.c1) continue;
    if (members.some(card => named.has(card.id))) continue;
    const alongRow = view.edges
      .filter(edge => edge.from === group.id || edge.to === group.id)
      .every(edge => {
        const other = ends.get(edge.from === group.id ? edge.to : edge.from);
        if (edge.kind === 'loops-back' || other === undefined) return false;
        const points = straight(end, other);
        return points !== undefined && points[0].y === points[1].y;
      });
    if (alongRow) parallel.add(group.id);
  }
  return parallel;
}

/** The fan where `edge` meets the parallel group `group`, on the side of the frame it meets. */
function fanOf(
  view: OverviewView,
  edge: OverviewView['edges'][number],
  group: string,
  ends: Map<string, End>
): OverviewFan | undefined {
  const into = edge.to === group;
  const end = ends.get(group);
  const other = ends.get(into ? edge.from : edge.to);
  if (edge.kind === 'loops-back' || end === undefined || other === undefined) return undefined;
  const side = other.box.x < end.box.x ? 'left' : 'right';
  const frameX = side === 'left' ? end.box.x : end.box.x + end.box.w;
  const cardX = side === 'left' ? frameX + OVERVIEW_GROUP_PAD : frameX - OVERVIEW_GROUP_PAD;
  const stubs = view.cards
    .filter(card => card.group === group)
    .map(card => {
      const atFrame = { x: frameX, y: rowCentre(card.row) };
      const atCard = { x: cardX, y: rowCentre(card.row) };
      return into
        ? { card: card.id, from: atFrame, to: atCard }
        : { card: card.id, from: atCard, to: atFrame };
    });
  const bar: [Point, Point] = [
    { x: frameX, y: rowCentre(end.span.r0) },
    { x: frameX, y: rowCentre(end.span.r1) },
  ];
  return { group, kind: edge.kind, side, into, bar, stubs };
}

/** One fan for each end of an edge that is a parallel group. */
function fansOf(view: OverviewView, parallel: Set<string>, ends: Map<string, End>): OverviewFan[] {
  return view.edges.flatMap(edge =>
    [edge.from, edge.to]
      .filter(id => parallel.has(id))
      .flatMap(group => fanOf(view, edge, group, ends) ?? [])
  );
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
  const parallel = parallelGroups(view);
  const contentSized = new Set(
    view.cards.flatMap(card =>
      card.group !== undefined && parallel.has(card.group) ? [card.id] : []
    )
  );
  return {
    cards,
    groups,
    edges,
    bounds: { x: left, y: top, w: right - left, h: bottom - top },
    contentSized,
    fans: fansOf(view, parallel, ends),
  };
}
