import type { ReactElement } from 'react';
import type { RoundVerdict } from './lib/board';
import type { TimelineRound as Round, TimelineStep } from './lib/timeline';
import { VERDICT_TEXT_CLASS } from './BoardCard';

/** A verdict's soft background, under `VERDICT_TEXT_CLASS`'s text colour (rule 5). */
const VERDICT_SOFT_CLASS: Record<RoundVerdict, string> = {
  approved: 'bg-[color:var(--success-soft)]',
  returned: 'bg-[color:var(--error-soft)]',
  undecided: 'bg-[color:var(--warning-soft)]',
  running: 'bg-[color:var(--running-soft)]',
  stopped: 'bg-surface-inset',
};

/** A check whose outcome the declaration does not word: the waiting colours. */
const UNDECLARED_CLASS = 'bg-surface-inset text-text-tertiary';

/**
 * One round of the declared loop as one compact row: "round N of M", its verdict in the
 * board's words and colour, then a chip per check in its verdict's colours; what was returned
 * on one truncated line under it.
 */
export function TimelineRound({ round }: { round: Round }): ReactElement {
  const of = round.max === null ? '' : ` of ${round.max.toString()}`;
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="text-console-13 text-text-tertiary">
          round {round.iteration.toString()}
          {of} ·{' '}
          <span className={`font-medium ${VERDICT_TEXT_CLASS[round.kind]}`}>{round.verdict}</span>
        </span>
        {round.groups.flatMap((group, index) =>
          group.steps.map(step => (
            // A stage's label repeats when its steps recorded on either side of another's.
            <CheckChip key={`${index.toString()}|${step.node}`} stage={group.label} step={step} />
          ))
        )}
      </div>
      {round.returnedSummary === null ? null : (
        <p className="truncate text-console-13 text-text-secondary" title={round.returnedSummary}>
          {round.returnedSummary}
        </p>
      )}
    </li>
  );
}

/** One check's outcome as a chip; its engine id, stage and summary on hover. */
function CheckChip({ stage, step }: { stage: string; step: TimelineStep }): ReactElement {
  const colours =
    step.verdict === null
      ? UNDECLARED_CLASS
      : `${VERDICT_SOFT_CLASS[step.verdict]} ${VERDICT_TEXT_CLASS[step.verdict]}`;
  const title = [`${step.node} · ${stage}`, step.summary].filter(Boolean).join('\n');
  return (
    <span
      data-verdict={step.verdict ?? 'undeclared'}
      title={title}
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-console-12 ${colours}`}
    >
      {step.name} ·{' '}
      <span className={step.outcome.mono ? 'font-mono' : 'font-medium'}>{step.outcome.text}</span>
    </span>
  );
}
