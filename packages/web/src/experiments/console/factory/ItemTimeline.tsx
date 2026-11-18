import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { VERDICT_TEXT_CLASS } from './BoardCard';
import { formatCost } from '../lib/format';
import { durationWords } from './lib/duration';
import type { OutcomeWords, StartedText, TimelineRound, TimelineRow } from './lib/timeline';

/** Every run on the item in start order, each with its rounds of the declared loop. */
export function ItemTimeline({ rows }: { rows: readonly TimelineRow[] }): ReactElement {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>Timeline</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">No run has worked this item yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {rows.map(row => (
            <TimelineEntry key={row.runId} row={row} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <h4 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
      {children}
    </h4>
  );
}

const OUTCOME_CLASS: Partial<Record<TimelineRow['status'], string>> = {
  running: 'text-[color:var(--running)]',
  paused: 'text-warning',
  failed: 'text-error',
  cancelled: 'text-text-tertiary',
};

function TimelineEntry({ row }: { row: TimelineRow }): ReactElement {
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-console-12 border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Link
          to={row.href}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm text-text-primary hover:underline"
        >
          <span className="font-medium">{row.stage ?? 'Outside the factory'}</span>
          <span className="font-mono text-console-12 text-text-secondary">{row.workflow}</span>
          {row.liveStepName === null ? null : (
            <span className="text-console-12 text-text-secondary" title={row.liveStep ?? undefined}>
              · {row.liveStepName}
            </span>
          )}
        </Link>
        <Outcome
          outcome={row.outcome}
          className={`text-console-12 font-medium ${OUTCOME_CLASS[row.status] ?? 'text-text-primary'}`}
          title={row.asked.length === 0 ? undefined : row.asked.join('\n')}
        />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-console-12 text-text-tertiary">
        <Started started={row.started} />
        <span className="tabular-nums">
          {row.durationMs === null ? 'not started' : durationWords(row.durationMs)}
        </span>
        <span className="tabular-nums">{row.costUsd === null ? '-' : formatCost(row.costUsd)}</span>
      </div>
      {row.rounds.length === 0 ? null : (
        <ol className="mt-1 flex flex-col gap-1.5 border-l border-border pl-3">
          {row.rounds.map(round => (
            <RoundEntry key={round.iteration} round={round} />
          ))}
        </ol>
      )}
    </li>
  );
}

/** An outcome in words, or the pack's own token in mono where the declaration does not word it. */
function Outcome({
  outcome,
  className,
  title,
}: {
  outcome: OutcomeWords;
  className: string;
  /** The hover text: the questions a run that asked left on the item. */
  title?: string;
}): ReactElement {
  return (
    <span className={`${className} ${outcome.mono ? 'font-mono' : ''}`} title={title}>
      {outcome.text}
    </span>
  );
}

function Started({ started }: { started: StartedText }): ReactElement {
  const words = (
    <>
      {started.text}
      {started.mono === null ? null : (
        <span className="ml-1 font-mono text-console-11">{started.mono}</span>
      )}
      {started.step === null ? null : (
        <span className="ml-1 text-text-secondary" title={started.step.node}>
          {started.step.name}
        </span>
      )}
    </>
  );
  if (started.runHref === null) return <span>{words}</span>;
  return (
    <Link to={started.runHref} className="hover:text-text-primary hover:underline">
      {words}
    </Link>
  );
}

function RoundEntry({ round }: { round: TimelineRound }): ReactElement {
  const of = round.max === null ? '' : ` of ${round.max.toString()}`;
  return (
    <li className="flex min-w-0 flex-col gap-0.5">
      <p className="text-console-12 text-text-secondary">
        round {round.iteration.toString()}
        {of} ·{' '}
        <span className={`font-medium ${VERDICT_TEXT_CLASS[round.kind]}`}>{round.verdict}</span>
      </p>
      {round.groups.map((group, index) => (
        // A label repeats when a stage's steps recorded on either side of another's.
        <p key={index} className="flex min-w-0 flex-wrap gap-x-2 text-console-11">
          <span className="text-text-tertiary">{group.label}</span>
          {group.steps.map(step => (
            <span
              key={step.node}
              className="text-text-secondary"
              title={
                step.summary === null
                  ? step.node
                  : `${step.node}
${step.summary}`
              }
            >
              {step.name} →{' '}
              <Outcome
                outcome={step.outcome}
                className={step.outcome.mono ? '' : 'font-medium text-text-primary'}
              />
            </span>
          ))}
        </p>
      ))}
      {round.returnedSummary === null ? null : (
        <p className="truncate text-console-12 text-text-secondary" title={round.returnedSummary}>
          {round.returnedSummary}
        </p>
      )}
    </li>
  );
}
