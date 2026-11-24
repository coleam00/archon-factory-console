import type { ReactElement, ReactNode } from 'react';
import { askQuestion } from './lib/attention';
import type { BoardCard } from './lib/board';
import type { BoardAsks } from './useBoardAsks';

/** "1 open ask", "3 open asks": what an ask button names. */
export function openAsksWords(count: number): string {
  return `${count.toString()} open ask${count === 1 ? '' : 's'}`;
}

/**
 * A card's stop line, as the board card and the Table row both draw it: what stopped a failed
 * item or what an item asks, in two lines at most. With several questions (`stopCount`), the
 * first is cut to one line and the count stands beside it, so the count is never clamped
 * away; the whole line is on hover.
 */
function StopText({
  card,
  as: Tag = 'span',
  className = '',
}: {
  card: Pick<BoardCard, 'stopLine' | 'stopCount'>;
  as?: 'p' | 'span';
  className?: string;
}): ReactNode {
  if (card.stopLine === null) return null;
  if (card.stopCount === null)
    return (
      <Tag title={card.stopLine} className={`line-clamp-2 ${className}`}>
        {card.stopLine}
      </Tag>
    );
  return (
    <Tag
      title={`${card.stopLine} · ${card.stopCount}`}
      className={`flex min-w-0 items-baseline gap-2 ${className}`}
    >
      <span className="min-w-0 truncate">{card.stopLine}</span>
      <span data-stop-count="" className="shrink-0 text-text-secondary">
        {card.stopCount}
      </span>
    </Tag>
  );
}

/** What stopped a failed item, or what an item that needs you asks, on the card. */
function StopLine({ card }: { card: BoardCard }): ReactNode {
  const tone = card.pill === 'failed' ? 'text-error' : 'text-warning';
  return <StopText card={card} as="p" className={`text-console-13 ${tone}`} />;
}

/** The warning dot an open ask carries; under reduced motion only the dot stays. */
function AskDot(): ReactElement {
  return (
    <span aria-hidden="true" className="relative flex h-2 w-2 shrink-0">
      <span className="absolute inset-0 rounded-full bg-warning motion-safe:animate-ping" />
      <span className="relative h-2 w-2 rounded-full bg-warning" />
    </span>
  );
}

/**
 * The foot of a board card: with open asks, one control, the newest one's question over how
 * many are open, that opens Archon's ask section for the item over the board; else the card's
 * stop line. It sits above the title's stretched link, so the rest of the card still opens the
 * item page. A card whose progress could not be read still says so under it.
 */
export function CardAsk({ card, asks }: { card: BoardCard; asks: BoardAsks }): ReactNode {
  const [first, ...rest] = asks.entriesOf(card.key);
  if (first === undefined) return <StopLine card={card} />;
  const words = openAsksWords(rest.length + 1);
  const question = askQuestion(first);
  return (
    <>
      <button
        type="button"
        data-ask-trigger={card.key}
        aria-haspopup="dialog"
        aria-expanded={asks.open?.key === card.key}
        aria-label={`${words}: ${question}`}
        onClick={event => {
          asks.openFor(card.key, event.currentTarget);
        }}
        className="relative z-10 flex min-w-0 max-w-full flex-col items-start gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <AskDot />
          <span title={question} className="min-w-0 truncate text-console-13 text-text-primary">
            {question}
          </span>
        </span>
        <span className="max-w-full rounded-console-12 border border-border px-2 py-1 text-console-12 text-text-primary transition-colors duration-150 ease-out hover:border-border-bright">
          {words}
        </span>
      </button>
      {asks.unread(card.key) ? <StopLine card={card} /> : null}
    </>
  );
}

/** The Table's "Stopped by or asks" cell: the stop line. */
export function RowAsk({ card }: { card: BoardCard }): ReactNode {
  return <StopText card={card} />;
}

/**
 * The Answer button a Table row with open asks shows beside its state pill, opening the same
 * ask view the card's button does. It sits in the State cell, not with the question in the
 * last column, so it is in view without scrolling the Table sideways.
 */
export function RowAnswer({ card, asks }: { card: BoardCard; asks: BoardAsks }): ReactNode {
  const count = asks.entriesOf(card.key).length;
  if (count === 0) return null;
  return (
    <button
      type="button"
      data-ask-trigger={card.key}
      aria-haspopup="dialog"
      aria-expanded={asks.open?.key === card.key}
      aria-label={`Answer: ${openAsksWords(count)}`}
      onClick={event => {
        asks.openFor(card.key, event.currentTarget);
      }}
      className="rounded-console-12 border border-border px-2 py-0.5 text-console-12 font-medium text-text-primary transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated"
    >
      Answer
    </button>
  );
}
