/**
 * Where the factory map draws its cards and arrows, in world units (px at zoom 1). The cards
 * are the board's columns (`boardColumns`: the view file's `columns`, else one per stage),
 * each holding the stages of its column that the view gives a `map` card, in the column's
 * order; a column left with none is not drawn. They sit in one row, left to right, always:
 * where the row does not fit its frame, the map pans (`map-camera.ts`).
 *
 * The arrows are the view file's `map.arrows` and no others, drawn between cards:
 *
 * - An arrow between two cards takes its direction from card order: into an earlier card, it
 *   is a send-back; into a later one, a forward hand-off. Stages order does not decide it,
 *   since a column need not hold neighbouring stages.
 * - Inside one card, an arrow to a later stage of the card is not drawn: the card's rows show
 *   that order. One into its own stage or an earlier one of the card is a send-back.
 * - A forward hand-off runs straight between neighbouring cards, its label on a pill above
 *   the line, one outcome per line. One that would skip cards gets no route of its own: its
 *   outcomes join the label of the hand-off from its source card to the next, as
 *   "<outcome> → <target card>", and when no such hand-off is declared, one is drawn for it.
 * - Forward hand-offs between one pair of cards are one line, their outcomes joined, each once.
 * - Every send-back is drawn in the one feedback lane under the row (`map-feedback-lane.ts`).
 *
 * Nothing crosses: forward lines run between cards at mid-height, the lane's legs under the
 * cards, and every pill sits in a gap or under the lane, clear of cards, lines and pills.
 */
import { boardColumns, type ColumnTone } from './board-columns';
import { feedbackLane, type FeedbackLane, type LaneCard, type SendBack } from './map-feedback-lane';
import { cardSize, GAP_MIN, LANE, PILL_CLEAR, PILL_GAP, PILL_LINE } from './map-sizes';
import { pillWidth, PILL_H } from './overview-layout';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];

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

/** One card on the map: a board column, holding the stages of it the map shows. */
export interface MapCardDecl {
  /** The column's id. */
  id: string;
  label: string;
  tone: ColumnTone;
  /** Its stages with a map card, in the column's order; never empty. */
  stages: string[];
}

export interface PlacedCard extends MapCardDecl {
  box: Box;
}

/** A forward hand-off between two neighbouring cards. */
export interface ArrowPath {
  /** Unique on the map: `decl:<index>` of the first declared arrow it draws. */
  id: string;
  /** The cards it joins, by card id. */
  from: string;
  to: string;
  /** Its pill's lines, one outcome each; empty for an unlabelled hand-off. */
  lines: string[];
  /** The SVG path, in M and H, ending where the arrowhead points. */
  d: string;
  /** Where its label pill goes; undefined when it has no label. */
  pill: Box | undefined;
}

export interface MapLayout {
  /** The cards, left to right. */
  cards: PlacedCard[];
  /** Every forward hand-off, left to right. */
  arrows: ArrowPath[];
  /** Every send-back, in the one feedback lane, and one pill per target stage. */
  feedback: FeedbackLane;
  /** The box holding every card, line and pill; empty at the origin when there are no cards. */
  bounds: Box;
}

/** The map's cards: the board's columns, each with the stages of it the map shows. */
export function mapCards(view: Declaration): MapCardDecl[] {
  const carded = new Set(view.map.cards.map(card => card.stage));
  return boardColumns(view).flatMap((column): MapCardDecl[] => {
    const stages = column.stages.filter(stage => carded.has(stage));
    return stages.length === 0
      ? []
      : [{ id: column.id, label: column.label, tone: column.tone, stages }];
  });
}

/** Where a stage sits: its card's index, and its row in that card. */
type Seat = { card: number; row: number };

/** A forward hand-off between two neighbouring cards, by the left card's index. */
interface Forward {
  id: string;
  left: number;
  parts: string[];
}

/** The declared arrows sorted into forward hand-offs and send-backs, by the rules above. */
function sortArrows(
  view: Declaration,
  cards: readonly MapCardDecl[]
): { forward: Forward[]; sendBacks: SendBack[] } {
  const seats = new Map<string, Seat>();
  cards.forEach((card, i) => {
    card.stages.forEach((stage, row) => seats.set(stage, { card: i, row }));
  });
  const forward = new Map<number, Forward>();
  const sendBacks: SendBack[] = [];
  view.map.arrows.forEach((arrow, index) => {
    const a = seats.get(arrow.from);
    const b = seats.get(arrow.to);
    if (a === undefined || b === undefined) return;
    const id = `decl:${index.toString()}`;
    const sameCard = a.card === b.card;
    if (b.card < a.card || (sameCard && b.row <= a.row)) {
      sendBacks.push({ id, from: cards[a.card]?.id ?? '', to: arrow.to, label: arrow.label });
      return;
    }
    if (sameCard) return;
    const outcomes = arrow.label?.split(', ') ?? [];
    const skip = b.card > a.card + 1;
    const target = cards[b.card]?.label ?? '';
    const parts = skip
      ? outcomes.length === 0
        ? [`→ ${target}`]
        : outcomes.map(outcome => `${outcome} → ${target}`)
      : outcomes;
    const into = forward.get(a.card) ?? { id, left: a.card, parts: [] };
    for (const part of parts) if (!into.parts.includes(part)) into.parts.push(part);
    forward.set(a.card, into);
  });
  return { forward: [...forward.values()].sort((p, q) => p.left - q.left), sendBacks };
}

/** A label's pill size: one line per outcome, the last without its comma. */
function pillOf(parts: readonly string[]): { lines: string[]; w: number; h: number } | undefined {
  if (parts.length === 0) return undefined;
  const lines = parts.map((part, i) => (i < parts.length - 1 ? `${part},` : part));
  return {
    lines,
    w: Math.max(...lines.map(line => pillWidth(line, false))),
    h: PILL_H + PILL_LINE * (lines.length - 1),
  };
}

function boundsOf(boxes: readonly Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(...boxes.map(box => box.x));
  const right = Math.max(...boxes.map(box => box.x + box.w));
  const top = Math.min(...boxes.map(box => box.y));
  const lowest = Math.max(...boxes.map(box => box.y + box.h));
  return { x: left, y: top, w: right - left, h: lowest - top };
}

/** The map's cards, lines, pills and bounds. */
export function layoutMap(view: Declaration): MapLayout {
  const decls = mapCards(view);
  const { forward, sendBacks } = sortArrows(view, decls);
  const size = cardSize(Math.max(0, ...decls.map(card => card.stages.length)));
  const pills = new Map(forward.map(entry => [entry.left, pillOf(entry.parts)]));
  const cards: PlacedCard[] = [];
  let x = 0;
  decls.forEach((card, i) => {
    cards.push({ ...card, box: { x, y: 0, w: size.w, h: size.h } });
    const pill = pills.get(i);
    x += size.w + Math.max(GAP_MIN, pill === undefined ? 0 : pill.w + 2 * PILL_CLEAR);
  });
  const mid = size.h / 2;
  const arrows = forward.flatMap((entry): ArrowPath[] => {
    const a = cards[entry.left];
    const b = cards[entry.left + 1];
    if (a === undefined || b === undefined) return [];
    const [x1, x2] = [a.box.x + a.box.w, b.box.x];
    const pill = pills.get(entry.left);
    return [
      {
        id: entry.id,
        from: a.id,
        to: b.id,
        lines: pill?.lines ?? [],
        d: `M${x1.toString()},${mid.toString()} H${x2.toString()}`,
        pill:
          pill === undefined
            ? undefined
            : { x: (x1 + x2 - pill.w) / 2, y: mid - PILL_GAP - pill.h, w: pill.w, h: pill.h },
      },
    ];
  });
  const laneCards = new Map(
    cards.map((card): [string, LaneCard] => [card.id, { box: card.box, stages: card.stages }])
  );
  const feedback = feedbackLane(laneCards, size.h + LANE, sendBacks);
  return {
    cards,
    arrows,
    feedback,
    bounds: boundsOf([
      ...cards.map(card => card.box),
      ...arrows.flatMap(arrow => (arrow.pill === undefined ? [] : [arrow.pill])),
      ...(feedback.extent === undefined ? [] : [feedback.extent]),
    ]),
  };
}

/**
 * The card a map opens on where it does not fit: the one holding the stage with the most
 * items in flight, the leftmost on a tie. Items on `skip` (the merged stage, which keeps
 * every change ever merged) do not count, or the map would open on Merged every time.
 * Undefined when nothing is in flight.
 */
export function busiestCard(
  cards: readonly PlacedCard[],
  count: (stage: string) => number,
  skip: string
): PlacedCard | undefined {
  let best: PlacedCard | undefined;
  let most = 0;
  for (const card of cards)
    for (const stage of card.stages) {
      const n = stage === skip ? 0 : count(stage);
      if (n > most) [best, most] = [card, n];
    }
  return best;
}
