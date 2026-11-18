import type { ReactElement, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { statusDotClass, statusTextClass } from '../lib/run-status';
import {
  itemPath,
  PILL_LABEL,
  type BoardCard as BoardCardFields,
  type Pill,
  type RoundVerdict,
} from './lib/board';
import { engineIdTitle } from './lib/step-label';
import { orderSearch } from './lib/work-orders';

/**
 * State colours: the console's status colours, with Needs you the one loud one. The board's
 * card and table and the item page's header all draw the pill from here.
 */
export const PILL_CLASS: Record<Pill, string> = {
  running: `bg-surface-hover ${statusTextClass.running}`,
  'needs-you': 'bg-warning/20 font-semibold text-warning',
  failed: 'bg-error/15 text-error',
  waiting: 'bg-surface-hover text-text-secondary',
  landed: 'bg-success/15 text-success',
};

/** A round's verdict colour, as a dot on the card and as its words on the item's timeline. */
const VERDICT_DOT_CLASS: Record<RoundVerdict, string> = {
  approved: 'bg-success',
  returned: 'bg-error',
  undecided: 'bg-warning',
  running: statusDotClass.running,
  stopped: 'bg-text-tertiary/60',
};

export const VERDICT_TEXT_CLASS: Record<RoundVerdict, string> = {
  approved: 'text-success',
  returned: 'text-error',
  undecided: 'text-warning',
  running: statusTextClass.running,
  stopped: 'text-text-tertiary',
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
            className={`inline-block h-1.5 w-1.5 rounded-full ${VERDICT_DOT_CLASS[dot.verdict]}`}
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
  dimmed = false,
}: {
  projectId: string;
  card: BoardCardFields;
  /** The card just changed column: a brief highlight shows it. */
  moved: boolean;
  /** Another work order is lit on the board (`?order=`) and this card is not in it. */
  dimmed?: boolean;
}): ReactElement {
  return (
    <article
      data-moved={moved ? 'true' : undefined}
      data-dimmed={dimmed ? 'true' : undefined}
      className={`relative flex flex-col gap-1 rounded border bg-surface-elevated px-2.5 py-2 hover:border-border-bright ${
        moved ? 'border-accent-bright ring-1 ring-accent-bright' : 'border-border'
      } ${dimmed ? 'opacity-40' : ''} motion-safe:transition`}
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
      {card.order === null ? null : <OrderChip order={card.order} />}
      {card.round === null ? null : <RoundDots round={card.round} />}
      {card.run === null ? null : <RunLink run={card.run} />}
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

/**
 * The running run's line: stage, step name, round. Breaks between its parts, never inside
 * a name; a name too long for the card is cut with the whole line in the title.
 */
function RunLink({ run }: { run: NonNullable<BoardCardFields['run']> }): ReactElement {
  return (
    <Link
      to={run.href}
      title={engineIdTitle(run.text, run.step)}
      aria-label={run.text}
      className={`${INNER_LINK} flex min-w-0 flex-wrap gap-x-1 text-console-11 ${statusTextClass.running}`}
    >
      {run.parts.map((part, index) => (
        <span
          key={index}
          className={index === 1 ? 'min-w-0 max-w-full truncate' : 'whitespace-nowrap'}
        >
          {part}
          {index < run.parts.length - 1 ? ' ·' : ''}
        </span>
      ))}
    </Link>
  );
}

/** "part of 48": lights the item's work order on the board, keeping the board's view. */
function OrderChip({ order }: { order: string }): ReactElement {
  const [params] = useSearchParams();
  return (
    <Link
      to={{ search: orderSearch(params, order) }}
      replace
      title={`Light work order ${order} on the board`}
      className={`${INNER_LINK} self-start rounded bg-surface-hover px-1.5 py-0.5 text-console-10 text-text-secondary`}
    >
      part of <span className="font-mono">{order}</span>
    </Link>
  );
}

const MERGE_STATE_WORDS = {
  unknown: {
    text: 'merge state unknown',
    title: 'The change host could not say whether this change merged',
  },
  pending: {
    text: 'checking merge state',
    title: 'The server is still asking the change host whether this change merged',
  },
} as const;

/**
 * Said where a change's merge state could not be read or is still being asked, so it never
 * reads as unmerged.
 */
export function MergeState({
  state,
}: {
  state: keyof typeof MERGE_STATE_WORDS | null;
}): ReactElement | null {
  if (state === null) return null;
  const words = MERGE_STATE_WORDS[state];
  return (
    <span className="text-text-tertiary" title={words.title}>
      {words.text}
    </span>
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
      {card.change === null ? null : card.change.href === null ? (
        <span className="text-text-secondary">{card.change.label}</span>
      ) : (
        <a
          href={card.change.href}
          target="_blank"
          rel="noreferrer"
          className={`${INNER_LINK} text-accent-bright`}
        >
          {card.change.label}
        </a>
      )}
      <MergeState state={card.change?.mergeState ?? null} />
    </span>
  );
}
