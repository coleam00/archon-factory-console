import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { statusDotClass, statusTextClass } from '../lib/run-status';
import {
  itemPath,
  PILL_LABEL,
  type BoardCard as BoardCardFields,
  type Pill,
  type RoundVerdict,
} from './lib/board';

/** State colours: the console's status colours, with Needs you the one loud one. */
export const PILL_CLASS: Record<Pill, string> = {
  running: `bg-surface-hover ${statusTextClass.running}`,
  'needs-you': 'bg-warning/20 font-semibold text-warning',
  failed: 'bg-error/15 text-error',
  waiting: 'bg-surface-hover text-text-secondary',
  landed: 'bg-success/15 text-success',
};

const DOT_CLASS: Record<RoundVerdict, string> = {
  approved: 'bg-success',
  returned: 'bg-error',
  undecided: 'bg-warning',
  running: statusDotClass.running,
  stopped: 'bg-text-tertiary/60',
};

export function PillBadge({ pill }: { pill: Pill }): ReactElement {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-console-10 font-medium ${PILL_CLASS[pill]}`}
    >
      {PILL_LABEL[pill]}
    </span>
  );
}

export function RoundDots({
  round,
}: {
  round: NonNullable<BoardCardFields['round']>;
}): ReactElement {
  return (
    <span className="flex items-center gap-1.5 text-console-11 text-text-secondary">
      {round.text}
      <span className="flex items-center gap-0.5">
        {round.dots.map(dot => (
          <span
            key={dot.iteration}
            role="img"
            aria-label={dot.label}
            title={dot.label}
            className={`inline-block h-1.5 w-1.5 rounded-full ${DOT_CLASS[dot.verdict]}`}
          />
        ))}
      </span>
    </span>
  );
}

/** A link inside the card, above the card-wide link to the item page. */
const INNER_LINK = 'relative z-10 hover:underline';

/**
 * One item on the board, its fields in DESIGN.md's order. The title's link stretches over
 * the card, so the whole card opens the item page while the run, returned and change links
 * sit above it: no link nests in another.
 */
export function BoardCard({
  projectId,
  card,
  moved,
}: {
  projectId: string;
  card: BoardCardFields;
  /** The card just changed column: a brief highlight shows it. */
  moved: boolean;
}): ReactElement {
  return (
    <article
      data-moved={moved ? 'true' : undefined}
      className={`relative flex flex-col gap-1 rounded border bg-surface-elevated px-2.5 py-2 hover:border-border-bright ${
        moved ? 'border-accent-bright ring-1 ring-accent-bright' : 'border-border'
      } motion-safe:transition-colors`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-console-11 text-text-tertiary">{card.key}</span>
        <PillBadge pill={card.pill} />
      </div>
      <Link
        to={itemPath(projectId, card.key)}
        className="line-clamp-3 text-console-12 font-medium leading-snug text-text-primary after:absolute after:inset-0"
      >
        {card.title}
      </Link>
      {card.round === null ? null : <RoundDots round={card.round} />}
      {card.run === null ? null : (
        <Link
          to={card.run.href}
          className={`${INNER_LINK} break-all font-mono text-console-11 ${statusTextClass.running}`}
        >
          {card.run.text}
        </Link>
      )}
      <CardLinks card={card} />
      {card.landedAt === null ? null : (
        <span className="text-console-11 text-text-tertiary">Landed {card.landedAt}</span>
      )}
      {card.stopLine === null ? null : (
        <p
          className={`line-clamp-2 text-console-11 ${card.pill === 'failed' ? 'text-error' : 'text-warning'}`}
        >
          {card.stopLine}
        </p>
      )}
    </article>
  );
}

function CardLinks({ card }: { card: BoardCardFields }): ReactNode {
  if (card.returned === null && card.change === null) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-console-11">
      {card.returned === null ? null : (
        <Link to={card.returned.href} className={`${INNER_LINK} text-text-secondary`}>
          returned ×{card.returned.count}
        </Link>
      )}
      {card.change === null ? null : (
        <a
          href={card.change.href}
          target="_blank"
          rel="noreferrer"
          className={`${INNER_LINK} text-accent-bright`}
        >
          {card.change.label}
        </a>
      )}
    </span>
  );
}
