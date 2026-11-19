import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { ClampedSummary } from '../../factory/ClampedSummary';
import { askQuestion } from '../../lib/ask-card';
import { relativeTime } from '../../lib/format';
import type { NeedsYouItem } from '../../lib/needs-you';
import type { AttentionQueue } from '../../skills/runs';
import { AskBody } from './AskBody';
import { CompactCard } from './CompactCard';

/** The item (or run) an ask is about, as its card's header names and links it. */
export interface AskSubject {
  key: string;
  title?: string;
  /** The factory item page when the project has a factory view, else the run; none when neither is known. */
  href?: string;
}

export interface AskCardProps {
  projectId: string;
  ask: NeedsYouItem;
  /** The queue's runs, which a paused gate is answered through. */
  queue: Pick<AttentionQueue, 'runs'>;
  /** Named in the header; left out where a group or the page already names the item. */
  subject?: AskSubject;
  /** The stage the ask came from when a factory view names it, else its workflow. */
  where?: string;
  /** `compact` (the Overview): the question, the recommended tile, and Open. */
  variant?: 'full' | 'compact';
  /** Where Open leads, for the compact card. */
  openHref?: string;
  /** Set once answered: the words it was answered with, shown in place. */
  answered?: string;
  folding?: boolean;
  onAnswered?: (ask: NeedsYouItem, label: string) => void;
}

// console-token-exception max-w-[760px] -- Visual standard rule 9: an ask card is at most 760 px wide in a page.
const WIDTH = 'max-w-[760px]';
const BOX = `@container flex w-full min-w-0 ${WIDTH} flex-col gap-3 rounded-console-16 border border-border bg-surface p-5`;
const FOLD = 'motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out';

/**
 * The ask card (DESIGN.md, Visual standard rule 9): the one design wherever an ask or a
 * paused wait is answered. It takes one ask and the queue's runs and needs no page around
 * it, so the Needs you tab, the Overview, the item page and a popover all draw it.
 */
export function AskCard(props: AskCardProps): ReactElement {
  const { ask, answered, folding = false, variant = 'full' } = props;
  if (variant === 'compact')
    return (
      <CompactCard
        ask={ask}
        question={askQuestion(ask)}
        header={<AskHeader {...props} />}
        openHref={props.openHref}
      />
    );
  return (
    <article
      aria-label={askQuestion(ask)}
      data-ask={ask.ref}
      tabIndex={-1}
      className={`${BOX} ${FOLD} ${folding ? 'opacity-0' : ''} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
    >
      <AskHeader {...props} />
      <h3 className="line-clamp-2 text-console-17 font-semibold text-text-primary [overflow-wrap:anywhere]">
        {askQuestion(ask)}
      </h3>
      {answered !== undefined ? (
        <p
          role="status"
          className="text-console-14 font-medium text-success [overflow-wrap:anywhere]"
        >
          Answered: {answered}
        </p>
      ) : (
        <>
          <AskContext ask={ask} />
          <AskBody {...props} />
        </>
      )}
    </article>
  );
}

/** Meta row: the item key (and title) on the left; the stage or workflow and the age on the right. */
function AskHeader({ subject, where, ask }: AskCardProps): ReactNode {
  if (subject === undefined && where === undefined && ask.pausedAt === null) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-console-13 text-text-tertiary">
      {subject === undefined ? null : <SubjectName subject={subject} />}
      <span className="ml-auto flex min-w-0 items-baseline gap-2">
        {where === undefined ? null : <span>{where}</span>}
        {ask.pausedAt === null ? null : <span>{relativeTime(ask.pausedAt)}</span>}
      </span>
    </div>
  );
}

export function SubjectName({ subject }: { subject: AskSubject }): ReactElement {
  const words = (
    <>
      {/* The key is how a person names the item: it never shrinks or wraps; the title truncates. */}
      <span className="shrink-0 whitespace-nowrap font-mono">{subject.key}</span>
      {subject.title === undefined ? null : (
        <span className="min-w-0 truncate text-text-secondary"> {subject.title}</span>
      )}
    </>
  );
  return subject.href === undefined ? (
    <span className="flex min-w-0 items-baseline gap-1">{words}</span>
  ) : (
    <Link
      to={subject.href}
      className="flex min-w-0 items-baseline gap-1 text-text-secondary hover:text-text-primary hover:underline"
    >
      {words}
    </Link>
  );
}

/** The ask's context, clamped to three lines with More; what happened, for a run it cannot answer. */
function AskContext({ ask }: { ask: NeedsYouItem }): ReactNode {
  if (ask.kind === 'attention')
    return ask.context === undefined ? null : (
      <ClampedSummary key={ask.context} text={ask.context} lines={3} />
    );
  return null;
}
