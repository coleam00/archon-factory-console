import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { SettledAsks } from '../../factory/lib/answered';
import { shortWorkflow } from '../../lib/ask-card';
import { relativeTime } from '../../lib/format';
import { SubjectName } from './AskCard';

// console-token-exception max-w-[760px] -- Visual standard rule 9: an ask card is at most 760 px wide in a page.
const WIDTH = 'max-w-[760px]';

const STATUS_WORDS: Record<NonNullable<SettledAsks['restart']>['status'], string> = {
  pending: 'waiting to start',
  running: 'running',
  paused: 'paused',
  completed: 'done',
  failed: 'failed',
  cancelled: 'cancelled',
};

/**
 * A set of asks an item settled, in the ask card's style, folded: the item and when, its first
 * question and what it was answered with, and the stage the settling started again. Unfolded
 * it lists every ask of the set. `href` is the item's page, or the run, as the open card links.
 */
export function AnsweredCard({
  projectId,
  entry,
  href,
}: {
  projectId: string;
  entry: SettledAsks;
  href: string | undefined;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [first, ...rest] = entry.asks;
  const shown = open ? entry.asks : first === undefined ? [] : [first];
  return (
    <article
      aria-label={`Answered on ${entry.itemKey}`}
      className={`flex w-full ${WIDTH} flex-col gap-3 rounded-console-16 border border-border bg-surface p-5`}
    >
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-console-13 text-text-tertiary">
        <SubjectName
          subject={{
            key: entry.itemKey,
            ...(entry.title === null ? {} : { title: entry.title }),
            ...(href === undefined ? {} : { href }),
          }}
        />
        <span className="ml-auto">answered {relativeTime(entry.at)}</span>
      </div>
      {shown.length === 0 ? (
        <h3 className="text-console-15 font-semibold text-text-primary">{counts(entry)}</h3>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map(ask => (
            <li key={ask.question} className="flex flex-col gap-0.5">
              <h3 className="line-clamp-2 text-console-15 font-semibold text-text-primary">
                {ask.question}
              </h3>
              <p
                className={`text-console-14 ${ask.withdrawn ? 'text-text-tertiary line-through' : 'text-text-secondary'}`}
              >
                {ask.withdrawn ? 'Withdrawn' : `Answered: ${ask.answer}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-console-13">
        <Restart projectId={projectId} restart={entry.restart} />
        {rest.length === 0 ? null : (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen(!open);
            }}
            className="ml-auto text-text-tertiary hover:text-text-primary"
          >
            {open ? 'Fewer' : `${rest.length.toString()} more`}
          </button>
        )}
      </div>
    </article>
  );
}

function counts(entry: SettledAsks): string {
  const parts = [`${entry.answered.toString()} answered`];
  if (entry.withdrawn > 0) parts.push(`${entry.withdrawn.toString()} withdrawn`);
  return parts.join(', ');
}

/** What the settling started: the stage, linking to its run, or that no run names it as its start. */
function Restart({
  projectId,
  restart,
}: {
  projectId: string;
  restart: SettledAsks['restart'];
}): ReactNode {
  if (restart === null)
    return <span className="text-text-tertiary">No run started from these answers</span>;
  return (
    <Link
      to={`/console/p/${projectId}/r/${restart.runId}`}
      title={restart.label}
      className="text-accent-bright hover:underline"
    >
      {shortWorkflow(restart.label)} started again ({STATUS_WORDS[restart.status]})
    </Link>
  );
}
