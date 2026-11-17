import type { FactoryItemDetail } from '../../skills/factory';
import { stageOfWorkflow } from './placement';
import { VERDICT_LABEL, type RoundVerdict } from './board';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type ItemRun = FactoryItemDetail['item']['runs'][number];
type RunFacts = FactoryItemDetail['runs'][number];
type Round = NonNullable<RunFacts['rounds']>['rounds'][number];
export type RoundStep = Round['steps'][number];
/** What started a run; absent for a start by hand. */
type StartCause = RunFacts['cause'];

/**
 * How a run started, in words. `mono` follows the words in mono: the step that started it,
 * or the trigger's id. `runHref` links the run that caused it.
 */
export interface StartedText {
  text: string;
  mono: string | null;
  runHref: string | null;
}

export interface TimelineGroup {
  /** The declared stage the steps belong to, as `stageOfWorkflow` places a step. */
  label: string;
  steps: RoundStep[];
}

export interface TimelineRound {
  iteration: number;
  max: number | null;
  /** The round's verdict, coloured as the board's round dots colour it. */
  kind: RoundVerdict;
  /** The verdict in the board's words (`VERDICT_LABEL`), so a round reads the same on both. */
  verdict: string;
  /** What the deciding step said, on a round that sent the item back; null otherwise. */
  returnedSummary: string | null;
  groups: TimelineGroup[];
}

export interface TimelineRow {
  runId: string;
  href: string;
  /** The workflow as the view names it, else as the run recorded it. */
  workflow: string;
  stage: string | null;
  started: StartedText;
  status: ItemRun['status'];
  /** The outcome in words: the recorded outcome as the pack names it, or what the run is doing. */
  outcome: string;
  /** Null for a run that has not started executing. */
  durationMs: number | null;
  costUsd: number | null;
  /** The running step while the run runs. */
  liveStep: string | null;
  rounds: TimelineRound[];
}

export const runHref = (projectId: string, runId: string): string =>
  `/console/p/${projectId}/r/${runId}`;

function outcomeWord(run: ItemRun): string {
  if (run.awaitingExecution !== null) return 'waiting to start';
  switch (run.status) {
    case 'pending':
      return 'waiting to start';
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'completed':
      return run.outcome ?? 'completed';
  }
}

/** A round's steps grouped under the stage each belongs to, in the order they recorded. */
function groupSteps(view: Declaration, workflow: string, steps: readonly RoundStep[]) {
  const groups: TimelineGroup[] = [];
  for (const step of steps) {
    const label = stageOfWorkflow(view, workflow, step.node)?.label ?? workflow;
    const last = groups.at(-1);
    if (last?.label === label) last.steps.push(step);
    else groups.push({ label, steps: [step] });
  }
  return groups;
}

function timelineRounds(
  view: Declaration,
  workflow: string,
  rounds: RunFacts['rounds']
): TimelineRound[] {
  if (rounds === null) return [];
  return rounds.rounds.map(round => ({
    iteration: round.iteration,
    max: rounds.max,
    kind: round.verdict,
    verdict: VERDICT_LABEL[round.verdict],
    returnedSummary: round.verdict === 'returned' ? round.summary : null,
    groups: groupSteps(view, workflow, round.steps),
  }));
}

function durationOf(run: ItemRun, now: number): number | null {
  if (run.status === 'pending' || run.awaitingExecution !== null) return null;
  const end = run.completedAt === null ? now : Date.parse(run.completedAt);
  return Math.max(0, end - Date.parse(run.startedAt));
}

type Row = Omit<TimelineRow, 'started'> & { cause: StartCause };

function startedText(projectId: string, row: Row, rows: readonly Row[]): StartedText {
  const { cause } = row;
  if (cause === undefined) return { text: 'Started by hand', mono: null, runHref: null };
  switch (cause.kind) {
    case 'run_ended': {
      const before = rows.find(other => other.runId === cause.runId);
      const href = runHref(projectId, cause.runId);
      if (before === undefined) return { text: 'After another run', mono: null, runHref: href };
      return {
        text: `After ${before.stage ?? before.workflow}: ${before.outcome}`,
        mono: null,
        runHref: href,
      };
    }
    case 'run_fired':
      return cause.node === null
        ? { text: 'Started by another run', mono: null, runHref: runHref(projectId, cause.runId) }
        : {
            text: 'Started by step',
            mono: cause.node,
            runHref: runHref(projectId, cause.runId),
          };
    case 'receipt':
      return { text: 'Started by a trigger', mono: cause.sourceInstanceId, runHref: null };
  }
}

/**
 * The item page's timeline: one row per run in the item read's order (start order), each
 * with the declared rounds loop's rounds under it.
 */
export function buildTimeline(
  view: Declaration,
  projectId: string,
  detail: FactoryItemDetail,
  now: number
): TimelineRow[] {
  const facts = new Map(detail.runs.map(run => [run.runId, run]));
  const rows = detail.item.runs.map((run): Row => {
    const fact = facts.get(run.id);
    const workflow = fact?.workflow ?? null;
    const liveStep = run.status === 'running' ? (fact?.step ?? null) : null;
    return {
      runId: run.id,
      href: runHref(projectId, run.id),
      workflow: workflow ?? run.workflow,
      stage: workflow === null ? null : (stageOfWorkflow(view, workflow, liveStep)?.label ?? null),
      status: run.status,
      outcome: outcomeWord(run),
      durationMs: durationOf(run, now),
      costUsd: fact?.costUsd ?? null,
      liveStep,
      rounds: workflow === null ? [] : timelineRounds(view, workflow, fact?.rounds ?? null),
      cause: fact?.cause,
    };
  });
  return rows.map(row => {
    const { cause: _cause, ...rest } = row;
    return { ...rest, started: startedText(projectId, row, rows) };
  });
}
