/**
 * The map's one feedback lane: every send-back (a return, a replan, a stage started again by
 * its answered asks) drawn on a single line under the stages, running right to left. A
 * send-back leaves its source card's lane edge on the source's leg, runs along the lane, and
 * enters its target's lane edge on the target's leg. A card has at most one leg of each kind,
 * so every send-back into one card shares one leg, and one label per target names them all.
 *
 * Why nothing crosses: every leg is a vertical between its card's edge and the lane, and every
 * run lies on the lane. Two verticals never cross; a vertical meets the lane only at its own
 * end; and no leg enters a card, since it starts on the card's own edge. Where two runs
 * overlap they are collinear: one line, not a crossing. The line exists only where some
 * send-back runs, so a stage started again by its own asks is a short U of its own, not joined
 * to a trunk beside it, which would claim a hand-off nobody makes.
 *
 * Overlapping runs draw as one line, so a solid one hides a dashed one beneath it. Each label
 * part therefore carries its send-back's style, and the label says which outcome is which.
 */
import type { GraphArrowStyle } from './map-graph';
import type { Box, Point } from './map-layout';
import { LINE_H } from './map-sizes';
import { halfWidth, wrapParts } from './map-stubs';

/**
 * How a card meets the lane: `one` for the single row (its bottom edge), `upper` and `lower`
 * for the rows above and below a lane between two rows (the upper's bottom, the lower's top).
 */
export type LaneSide = 'one' | 'upper' | 'lower';

/**
 * Where a card's two legs meet its lane edge, as fractions of its width, the target's left of
 * the source's. Between two rows the upper and lower cards' legs keep to opposite outer
 * quarters: a column's two cards then never put legs in one line across the lane, and the
 * middle half stays free for the forward hand-offs between the rows (`map-layout.ts`).
 */
const LEGS: Record<LaneSide, { to: number; from: number }> = {
  one: { to: 0.35, from: 0.65 },
  upper: { to: 0.12, from: 0.22 },
  lower: { to: 0.78, from: 0.88 },
};

/** From the lane to its first label line's centre. */
const LABEL_OFFSET = LINE_H / 2 + 6;

export interface LaneCard {
  box: Box;
  side: LaneSide;
}

/** A send-back to draw, declared or from the pack graph. */
export interface SendBack {
  id: string;
  from: string;
  to: string;
  label: string | undefined;
  style: GraphArrowStyle;
  problems: string[];
}

export interface LanePath extends SendBack {
  /** The SVG path, ending where the arrowhead points into the target. */
  d: string;
}

/** One outcome in a target's label, in its send-back's style. */
export interface LanePart {
  text: string;
  style: GraphArrowStyle;
}

export interface LaneLabel {
  stage: string;
  /** Top to bottom, each with where its centre goes. */
  lines: { parts: LanePart[]; at: Point }[];
}

export interface FeedbackLane {
  /** One path per send-back, so each keeps its style and title: declared, solid, then problem. */
  paths: LanePath[];
  /** One per target stage. */
  labels: LaneLabel[];
  /** What the legs, the lane and its labels take; undefined when nothing sends back. */
  extent: Box | undefined;
}

/** Drawn last on top: a refused send-back's error dashes and title are not hidden. */
const DRAW_ORDER: Record<GraphArrowStyle, number> = { declared: 0, solid: 1, problem: 2 };

const edgeY = (card: LaneCard): number =>
  card.side === 'lower' ? card.box.y : card.box.y + card.box.h;

const legX = (card: LaneCard, leg: 'to' | 'from'): number =>
  card.box.x + card.box.w * LEGS[card.side][leg];

/** Each target's outcomes in the order its send-backs come, each outcome once per style. */
function partsByTarget(sendBacks: readonly SendBack[]): Map<string, LanePart[]> {
  const parts = new Map<string, LanePart[]>();
  for (const sendBack of sendBacks) {
    const list = parts.get(sendBack.to) ?? [];
    for (const text of sendBack.label?.split(', ') ?? []) {
      if (!list.some(part => part.text === text && part.style === sendBack.style))
        list.push({ text, style: sendBack.style });
    }
    parts.set(sendBack.to, list);
  }
  return parts;
}

/** The lines each target's label wraps to. */
function labelLines(sendBacks: readonly SendBack[]): Map<string, LanePart[][]> {
  const lines = new Map<string, LanePart[][]>();
  for (const [stage, parts] of partsByTarget(sendBacks)) {
    if (parts.length > 0)
      lines.set(
        stage,
        wrapParts(parts, part => part.text)
      );
  }
  return lines;
}

/** How far below the lane its labels reach: room a gap under it must leave. */
export function laneLabelRoom(sendBacks: readonly SendBack[]): number {
  const most = Math.max(0, ...[...labelLines(sendBacks).values()].map(lines => lines.length));
  return most === 0 ? 0 : LABEL_OFFSET + LINE_H * most - LINE_H / 2;
}

const lineText = (parts: readonly LanePart[]): string => parts.map(part => part.text).join(', ');

/**
 * The send-backs between two `cards` drawn on the lane at `y`, labels under it. A send-back
 * whose source or target has no card is left out.
 */
export function feedbackLane(
  cards: ReadonlyMap<string, LaneCard>,
  y: number,
  sendBacks: readonly SendBack[]
): FeedbackLane {
  const drawn = sendBacks.filter(entry => cards.has(entry.from) && cards.has(entry.to));
  const paths = drawn
    .flatMap((entry): LanePath[] => {
      const from = cards.get(entry.from);
      const to = cards.get(entry.to);
      if (from === undefined || to === undefined) return [];
      const d = `M${legX(from, 'from')},${edgeY(from)} V${y} H${legX(to, 'to')} V${edgeY(to)}`;
      return [{ ...entry, d }];
    })
    .sort((p, q) => DRAW_ORDER[p.style] - DRAW_ORDER[q.style]);
  const labels = [...labelLines(drawn)].flatMap(([stage, lines]): LaneLabel[] => {
    const card = cards.get(stage);
    if (card === undefined) return [];
    const x = legX(card, 'to');
    return [
      {
        stage,
        lines: lines.map((parts, index) => ({
          parts,
          at: { x, y: y + LABEL_OFFSET + LINE_H * index },
        })),
      },
    ];
  });
  return { paths, labels, extent: extentOf(drawn, cards, y, labels) };
}

function extentOf(
  drawn: readonly SendBack[],
  cards: ReadonlyMap<string, LaneCard>,
  y: number,
  labels: readonly LaneLabel[]
): Box | undefined {
  if (drawn.length === 0) return undefined;
  const xs = drawn.flatMap(entry => {
    const from = cards.get(entry.from);
    const to = cards.get(entry.to);
    return from === undefined || to === undefined ? [] : [legX(from, 'from'), legX(to, 'to')];
  });
  for (const label of labels) {
    const half = halfWidth(label.lines.map(line => `${lineText(line.parts)},`));
    const x = label.lines[0]?.at.x ?? 0;
    xs.push(x - half, x + half);
  }
  const lowest = Math.max(y, ...labels.flatMap(label => label.lines.map(l => l.at.y + LINE_H / 2)));
  const left = Math.min(...xs);
  return { x: left, y, w: Math.max(...xs) - left, h: lowest - y };
}
