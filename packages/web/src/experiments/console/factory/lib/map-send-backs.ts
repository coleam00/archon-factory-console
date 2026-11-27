/**
 * The map's send-backs, card by card: every send-back the pack graph draws (`map-layout.ts`
 * says which arrows are send-backs) as its own route, one per pair of stages, from the card it
 * leaves to the stage it returns to. The map draws one card's routes at a time, while that card
 * is hovered, focused or pinned (`MapSendBacks`), so each card's routes are laid out on their
 * own: they never meet another card's.
 *
 * A card S with n routes: each route into a card T (S itself included) gets its own target leg
 * on T's bottom edge, spread over T's 0.1-0.45 of the width by target row, then source row.
 * The routes sorted by target leg, left to right, take source legs on S's bottom edge over its
 * 0.55-0.9, right to left, and tracks under the row from the deepest up: the leftmost target
 * takes the rightmost source leg and the deepest track. Every target leg lies left of every
 * source leg (a target is on an earlier card, or on S left of its source legs), so the routes
 * are U shapes nested inside each other: none crosses another, and none enters a card, since
 * every leg starts on a card's own bottom edge and every track runs under the row.
 *
 * The pills sit under the deepest track, where nothing is drawn (rule 4: a label never sits
 * on a line), in their routes' order, each as near its target leg as the pills before it
 * allow, and within the row's span, so a long label on the first card's leg does not hang off
 * the row's start (where the map opens) (`placePills`).
 */
import type { Box, Point } from './map-layout';
import { oneLineOf, pillSize } from './map-pill';
import { LANE, PILL_LINE, TRACK } from './map-sizes';
import { PILL_H } from './overview-layout';

/** Where a card's legs meet its bottom edge, as fractions of its width. */
const TARGET_FROM = 0.1;
const TARGET_TO = 0.45;
const SOURCE_FROM = 0.55;
const SOURCE_TO = 0.9;
/** From the deepest track to the first band of pills, between bands, and between pills on one band. */
const PILL_OFFSET = 8;
const BAND_GAP = 4;
const PILL_CLEAR = 8;

export interface RouteCard {
  box: Box;
  /** Its stages, in the order it lists them. */
  stages: readonly string[];
}

/** A send-back the pack graph draws, from a stage into a stage: one per pair of stages. */
export interface SendBackArrow {
  /** Unique on the map: `decl:<index>`. */
  id: string;
  /** The card it leaves, by card id. */
  card: string;
  /** The stage it leaves and the stage it returns to. */
  from: string;
  to: string;
  /** Its outcomes and answers, in the pack's words, each once. */
  words: string[];
}

interface RoutePill {
  box: Box;
  lines: string[];
}

export interface SendBackRoute extends SendBackArrow {
  /** Its corners, from its source leg to the point its arrowhead reaches. */
  points: Point[];
  /** The same route as an SVG path, in M, H and V. */
  d: string;
  /** Undefined for a route with nothing to say. */
  pill: RoutePill | undefined;
}

export interface CardSendBacks {
  /** Its routes, sorted by target leg, left to right. */
  routes: SendBackRoute[];
  /** What its routes and pills take. */
  extent: Box;
}

const bottomOf = (box: Box): number => box.y + box.h;

/** Where a stage sits: its card and its row there. */
interface Seat {
  card: string;
  row: number;
}

/** Spread `n` legs over `from..to` of a box's width, the first nearest `from`. */
const legX = (box: Box, from: number, to: number, n: number, i: number): number =>
  box.x + box.w * (from + ((to - from) / n) * (i + 0.5));

/**
 * The pill's lines: its words on one line (`oneLineOf`), and, where the source card or the
 * target card holds more than one stage, which stage it leaves and which it returns to, so two
 * routes from different rows of one card read apart.
 */
function pillLines(
  arrow: SendBackArrow,
  stageCount: (stage: string) => number,
  stageLabel: (stage: string) => string
): string[] {
  const lines = arrow.words.length > 0 ? [oneLineOf(arrow.words)] : [];
  if (stageCount(arrow.from) > 1 || stageCount(arrow.to) > 1)
    lines.push(`${stageLabel(arrow.from)} → ${stageLabel(arrow.to)}`);
  return lines;
}

/** One card's routes, laid out as the header says; `arrows` all leave `source`. */
function cardRoutes(
  source: RouteCard,
  arrows: readonly SendBackArrow[],
  cards: ReadonlyMap<string, RouteCard>,
  seats: ReadonlyMap<string, Seat>
): { arrow: SendBackArrow; points: Point[] }[] {
  const byTarget = new Map<string, SendBackArrow[]>();
  for (const arrow of arrows) {
    const card = seats.get(arrow.to)?.card ?? '';
    byTarget.set(card, [...(byTarget.get(card) ?? []), arrow]);
  }
  const row = (stage: string): number => seats.get(stage)?.row ?? 0;
  const legs = [...byTarget].flatMap(([card, into]) => {
    const box = cards.get(card)?.box;
    if (box === undefined) return [];
    const sorted = [...into].sort((p, q) => row(p.to) - row(q.to) || row(p.from) - row(q.from));
    return sorted.map((arrow, i) => ({
      arrow,
      x: legX(box, TARGET_FROM, TARGET_TO, sorted.length, i),
      y: bottomOf(box),
    }));
  });
  legs.sort((p, q) => p.x - q.x);
  const top = bottomOf(source.box);
  const n = legs.length;
  return legs.map(({ arrow, x, y }, i) => {
    // The leftmost target takes the rightmost source leg and the deepest track.
    const from = legX(source.box, SOURCE_TO, SOURCE_FROM, n, i);
    const track = top + LANE + (n - 1 - i) * TRACK;
    return {
      arrow,
      points: [
        { x: from, y: top },
        { x: from, y: track },
        { x, y: track },
        { x, y },
      ],
    };
  });
}

/**
 * The pills under the deepest track at `y`, in their routes' order (by target leg, left to
 * right), each as near its target leg as it can be within the row's span `row`: centred on it
 * where that is free, else just right of the pills before it on that band, and a band down
 * only where the band has no room left. Sliding along a band rather than stacking keeps the
 * band under the row shallow when many routes return to one card (Intake's), and keeps the
 * pills in their legs' order.
 */
function placePills(
  wanted: readonly { lines: string[]; x: number }[],
  y: number,
  row: { lo: number; hi: number }
): (RoutePill | undefined)[] {
  /** Where each band's next pill may start. */
  const free: number[] = [];
  return wanted.map(({ lines, x }) => {
    if (lines.length === 0) return undefined;
    const { w, h } = pillSize(lines);
    const centred = Math.max(row.lo, Math.min(row.hi - w, x - w / 2));
    const leftOn = (band: number): number => Math.max(centred, free[band] ?? row.lo);
    // A band nothing is on yet always takes it, even a pill wider than the row.
    let band = 0;
    while (free[band] !== undefined && leftOn(band) + w > row.hi) band += 1;
    const left = leftOn(band);
    free[band] = left + w + PILL_CLEAR;
    const box = { x: left, y: y + PILL_OFFSET + band * (PILL_H + PILL_LINE + BAND_GAP), w, h };
    return { box, lines };
  });
}

function extentOf(routes: readonly SendBackRoute[]): Box {
  const boxes = routes.flatMap(route => (route.pill === undefined ? [] : [route.pill.box]));
  const points = routes.flatMap(route => route.points);
  const xs = [...points.map(p => p.x), ...boxes.flatMap(box => [box.x, box.x + box.w])];
  const ys = [...points.map(p => p.y), ...boxes.flatMap(box => [box.y, box.y + box.h])];
  const [left, top] = [Math.min(...xs), Math.min(...ys)];
  return { x: left, y: top, w: Math.max(...xs) - left, h: Math.max(...ys) - top };
}

const pathOf = (points: readonly Point[]): string => {
  const [start, down, across, up] = points as [Point, Point, Point, Point];
  return `M${start.x.toString()},${start.y.toString()} V${down.y.toString()} H${across.x.toString()} V${up.y.toString()}`;
};

/**
 * Every card's send-backs, by card id, for the cards (by card id, in row order) and the
 * send-backs between them; `stageLabel` names a stage on a pill. A card nothing leaves is not
 * in the map, nor is a send-back whose card or target stage has no card.
 */
export function sendBackRoutes(
  cards: ReadonlyMap<string, RouteCard>,
  arrows: readonly SendBackArrow[],
  stageLabel: (stage: string) => string
): Map<string, CardSendBacks> {
  const seats = new Map<string, Seat>();
  for (const [card, { stages }] of cards)
    stages.forEach((stage, row) => seats.set(stage, { card, row }));
  const stageCount = (stage: string): number =>
    cards.get(seats.get(stage)?.card ?? '')?.stages.length ?? 0;
  const boxes = [...cards.values()].map(card => card.box);
  const row = {
    lo: Math.min(...boxes.map(box => box.x)),
    hi: Math.max(...boxes.map(box => box.x + box.w)),
  };
  const out = new Map<string, CardSendBacks>();
  for (const [id, source] of cards) {
    const mine = arrows.filter(arrow => arrow.card === id && seats.has(arrow.to));
    if (mine.length === 0) continue;
    const laid = cardRoutes(source, mine, cards, seats);
    const deepest = Math.max(...laid.map(({ points }) => (points[1] as Point).y));
    const pills = placePills(
      laid.map(({ arrow, points }) => ({
        lines: pillLines(arrow, stageCount, stageLabel),
        x: (points[3] as Point).x,
      })),
      deepest,
      row
    );
    const routes = laid.map(
      ({ arrow, points }, i): SendBackRoute => ({
        ...arrow,
        points,
        d: pathOf(points),
        pill: pills[i],
      })
    );
    out.set(id, { routes, extent: extentOf(routes) });
  }
  return out;
}
