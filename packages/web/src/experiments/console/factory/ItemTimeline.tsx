import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { formatCost, formatElapsed } from '../lib/format';
import type { StartedText, TimelineRound, TimelineRow } from './lib/timeline';

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
          <span className="break-all font-mono text-console-12 text-text-secondary">
            {row.liveStep === null ? row.workflow : `${row.workflow} · ${row.liveStep}`}
          </span>
        </Link>
        <span
          className={`text-console-12 font-medium ${OUTCOME_CLASS[row.status] ?? 'text-text-primary'}`}
        >
          {row.outcome}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-console-12 text-text-tertiary">
        <Started started={row.started} />
        <span className="tabular-nums">
          {row.durationMs === null ? 'not started' : formatElapsed(row.durationMs / 1000)}
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

function Started({ started }: { started: StartedText }): ReactElement {
  const words = (
    <>
      {started.text}
      {started.mono === null ? null : (
        <span className="ml-1 font-mono text-console-11">{started.mono}</span>
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
        <span className={round.returned ? 'font-medium text-warning' : 'font-medium'}>
          {round.verdict}
        </span>
      </p>
      {round.groups.map((group, index) => (
        // A label repeats when a stage's steps recorded on either side of another's.
        <p key={index} className="flex min-w-0 flex-wrap gap-x-2 text-console-11">
          <span className="text-text-tertiary">{group.label}</span>
          {group.steps.map(step => (
            <span
              key={step.node}
              className="break-all font-mono text-text-secondary"
              title={step.summary ?? undefined}
            >
              {step.node} → {step.outcome}
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
