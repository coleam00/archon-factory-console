import type { ReactElement, ReactNode } from 'react';
import type { BoardCard } from './lib/board';
import type { BoardAskFace as Face } from './lib/board-ask';
import type { BoardAsks } from './useBoardAsks';

/** What stopped a failed item, or what an item that needs you asks, as the card has always said it. */
function StopLine({ card }: { card: BoardCard }): ReactNode {
  if (card.stopLine === null) return null;
  return (
    <p
      className={`line-clamp-2 text-console-13 ${card.pill === 'failed' ? 'text-error' : 'text-warning'}`}
    >
      {card.stopLine}
    </p>
  );
}

/**
 * The foot of a board card: an answer given from the board while it stands, else the open
 * ask's face for an item that needs you, else the card's stop line. Until the project's queue
 * is read (or while it holds nothing for the item the item read still lists), the stop line
 * stays: the face draws only what the popover can answer.
 */
export function CardAsk({ card, asks }: { card: BoardCard; asks: BoardAsks }): ReactNode {
  const answered = asks.answeredLine(card.key);
  if (answered !== null)
    return (
      <p role="status" className="text-console-13 text-success">
        {answered}
      </p>
    );
  const shown = card.pill === 'needs-you' ? asks.faceOf(card.key) : null;
  if (shown === null) return <StopLine card={card} />;
  return (
    <>
      <AskFace itemKey={card.key} face={shown.face} asks={asks} />
      {shown.unread ? <StopLine card={card} /> : null}
    </>
  );
}

/**
 * The approval card's face (DESIGN.md, owner change 3; Visual standard rules 7 and 9): the
 * ping, "N questions" when there are several, the first ask's question and the line Needs you
 * shows for it, as one control opening the ask in place. It sits above the title's stretched
 * link, so the rest of the card still opens the item page.
 */
function AskFace({
  itemKey,
  face,
  asks,
}: {
  itemKey: string;
  face: Face;
  asks: BoardAsks;
}): ReactElement {
  const several = face.count >= 2 ? `${face.count.toString()} questions` : null;
  return (
    <button
      type="button"
      data-ask-trigger={itemKey}
      aria-haspopup="dialog"
      aria-expanded={asks.open?.key === itemKey}
      aria-label={`Answer: ${face.question}${several === null ? '' : ` (${several})`}`}
      onClick={event => {
        asks.openFor(itemKey, event.currentTarget);
      }}
      className="relative z-10 flex flex-col items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex items-center gap-2">
        <Ping />
        {several === null ? null : (
          <span className="text-console-12 text-text-tertiary">{several}</span>
        )}
      </span>
      <span className="line-clamp-2 text-console-13 text-text-primary">{face.question}</span>
      <span
        title={face.tile.detail}
        className={`rounded-console-12 border px-2 py-1 text-console-12 text-text-primary transition-colors duration-150 ease-out ${
          face.tile.recommended
            ? 'border-accent-muted bg-[color:var(--accent-soft)]'
            : 'border-border hover:border-border-bright'
        }`}
      >
        {face.line}
      </span>
    </button>
  );
}

/** Needs you's ping (rule 7): an 8 px warning dot; under reduced motion only the dot stays. */
function Ping(): ReactElement {
  return (
    <span data-ping="true" aria-hidden="true" className="relative flex h-2 w-2">
      <span className="absolute inset-0 rounded-full bg-warning motion-safe:animate-ping" />
      <span className="relative h-2 w-2 rounded-full bg-warning" />
    </span>
  );
}

/**
 * The Table's "Stopped by or asks" cell: the answer given from the board while it stands,
 * else the stop line, with an Answer button opening the same popover the card's face does.
 */
export function RowAsk({ card, asks }: { card: BoardCard; asks: BoardAsks }): ReactNode {
  const answered = asks.answeredLine(card.key);
  if (answered !== null)
    return (
      <span role="status" className="text-success">
        {answered}
      </span>
    );
  const askable = card.pill === 'needs-you' && (asks.asksOf(card.key)?.length ?? 0) > 0;
  if (!askable) return card.stopLine;
  return (
    <span className="flex flex-wrap items-baseline gap-2">
      <button
        type="button"
        data-ask-trigger={card.key}
        aria-haspopup="dialog"
        aria-expanded={asks.open?.key === card.key}
        onClick={event => {
          asks.openFor(card.key, event.currentTarget);
        }}
        className="rounded-console-12 border border-border px-2 py-0.5 text-console-12 font-medium text-text-primary transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated"
      >
        Answer
      </button>
      {card.stopLine}
    </span>
  );
}
