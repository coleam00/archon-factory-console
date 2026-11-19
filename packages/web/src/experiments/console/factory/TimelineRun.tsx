import type { CSSProperties, ReactElement, ReactNode } from 'react';
import {
  ArrowRight,
  CircleDot,
  CircleSlash,
  CircleX,
  GitMerge,
  MessageCircleQuestion,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { formatCost, formatDateTime } from '../lib/format';
import { durationWords } from './lib/duration';
import type {
  OutcomeWords,
  RunGroup,
  RunKind,
  StartedText,
  TimelineMerged,
  TimelineRow,
} from './lib/timeline';
import { ShadowRow } from './ShadowRow';
import { TimelineRound } from './TimelineRound';
import { TONES } from './tones';

/**
 * Each outcome's icon and colour (rule 5's state colours). A send-back's icon takes the
 * send-back line's colour (rule 4); `running` has a pulsing dot instead of an icon (rule 7).
 */
const KIND_LOOK: Record<Exclude<RunKind, 'running'>, { Icon: LucideIcon; className: string }> = {
  'sent-on': { Icon: ArrowRight, className: 'text-text-tertiary' },
  returned: { Icon: Undo2, className: 'text-[color:var(--node-approval)]' },
  asked: { Icon: MessageCircleQuestion, className: 'text-warning' },
  failed: { Icon: CircleX, className: 'text-error' },
  stopped: { Icon: CircleSlash, className: 'text-text-tertiary' },
  other: { Icon: CircleDot, className: 'text-text-tertiary' },
};

/** The outcome's words in its state colour; a group colour is never a text colour (rule 5). */
const KIND_TEXT: Partial<Record<RunKind, string>> = {
  running: 'text-[color:var(--running)]',
  asked: 'text-warning',
  failed: 'text-error',
};

/** The dot's colour: the stage group's (a swatch, as the legend's), a shadow's, or none. */
function dotColor(group: RunGroup | null): string {
  if (group === null) return 'var(--text-tertiary)';
  if (group === 'shadow') return 'var(--node-opaque)';
  return TONES[group].color;
}

/**
 * One timeline entry's frame: the dot on the connecting line in the left gutter, the entry
 * beside it. The line runs on to the next entry's dot unless this is the last.
 */
function Entry({
  color,
  last,
  children,
}: {
  color: string;
  last: boolean;
  children: ReactNode;
}): ReactElement {
  const dot: CSSProperties = { backgroundColor: color };
  return (
    <li className="flex min-w-0 gap-3">
      <div aria-hidden="true" className="flex shrink-0 flex-col items-center">
        <span data-timeline-dot="true" className="mt-1.5 size-2.5 rounded-full" style={dot} />
        {last ? null : <span className="mt-1 w-px flex-1 bg-border" />}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-1.5 ${last ? '' : 'pb-5'}`}>{children}</div>
    </li>
  );
}

function KindIcon({ kind }: { kind: RunKind }): ReactElement {
  if (kind === 'running')
    return (
      <span data-kind="running" className="flex size-4 shrink-0 items-center justify-center">
        <span className="size-2 rounded-full bg-[color:var(--running)] motion-safe:animate-pulse" />
      </span>
    );
  const { Icon, className } = KIND_LOOK[kind];
  return <Icon data-kind={kind} aria-hidden="true" className={`size-4 shrink-0 ${className}`} />;
}

/** Duration and cost, right-aligned in mono. */
function Figures({ row }: { row: TimelineRow }): ReactElement {
  return (
    <span
      data-figures="true"
      className="ml-auto shrink-0 whitespace-nowrap text-right font-mono text-console-13 tabular-nums text-text-tertiary"
    >
      {row.durationMs === null ? 'not started' : durationWords(row.durationMs)} ·{' '}
      {row.costUsd === null ? '-' : formatCost(row.costUsd)}
    </span>
  );
}

/** One run: its outcome icon, stage and workflow linking to the run, outcome, figures, rounds. */
export function TimelineRun({ row, last }: { row: TimelineRow; last: boolean }): ReactElement {
  return (
    <Entry color={dotColor(row.group)} last={last}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <KindIcon kind={row.kind} />
        <Link
          to={row.href}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 hover:underline"
        >
          <span className="text-console-15 font-semibold text-text-primary">
            {row.stage ?? row.workflow}
          </span>
          <span className="font-mono text-console-12 text-text-tertiary">{row.workflow}</span>
          {row.liveStepName === null ? null : (
            <span className="text-console-13 text-text-secondary" title={row.liveStep ?? undefined}>
              · {row.liveStepName}
            </span>
          )}
        </Link>
        <Outcome
          outcome={row.outcome}
          className={`text-console-13 font-medium ${KIND_TEXT[row.kind] ?? 'text-text-primary'}`}
          title={row.asked.length === 0 ? undefined : row.asked.join('\n')}
        />
        <Figures row={row} />
      </div>
      <Started started={row.started} />
      {row.rounds.length === 0 ? null : (
        <ol aria-label="Rounds" className="flex flex-col gap-1.5">
          {row.rounds.map(round => (
            <TimelineRound key={round.iteration} round={round} />
          ))}
        </ol>
      )}
      {row.shadows.length === 0 ? null : (
        <ol aria-label="What its shadow steps would have done" className="flex flex-col gap-1.5">
          {row.shadows.map(shadow => (
            <ShadowRow key={shadow.key} shadow={shadow} />
          ))}
        </ol>
      )}
    </Entry>
  );
}

/** The timeline's last entry once the change merged, in the Merged column's colour. */
export function TimelineMergedEntry({ merged }: { merged: TimelineMerged }): ReactElement {
  return (
    <Entry color={TONES.merged.color} last>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <GitMerge data-kind="merged" aria-hidden="true" className="size-4 shrink-0 text-success" />
        <span className="text-console-15 font-semibold text-text-primary">Merged</span>
        {merged.at === null ? null : (
          <span className="ml-auto shrink-0 text-right font-mono text-console-13 tabular-nums text-text-tertiary">
            {formatDateTime(merged.at)}
          </span>
        )}
      </div>
    </Entry>
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

/** How the run started, at the Meta size; a trigger's id is its hover, never its words. */
function Started({ started }: { started: StartedText }): ReactElement {
  const words = (
    <>
      {started.text}
      {started.mono === null ? null : <span className="ml-1 font-mono">{started.mono}</span>}
      {started.step === null ? null : (
        <span className="ml-1 text-text-secondary" title={started.step.node}>
          {started.step.name}
        </span>
      )}
    </>
  );
  return (
    <p className="text-console-13 text-text-tertiary" title={started.title ?? undefined}>
      {started.runHref === null ? (
        words
      ) : (
        <Link to={started.runHref} className="hover:text-text-primary hover:underline">
          {words}
        </Link>
      )}
    </p>
  );
}
