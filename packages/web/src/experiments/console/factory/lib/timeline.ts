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

/**
 * An outcome as a person reads it. Where the declaration says what an outcome means, its
 * words (`mono` false); a pack's own token the declaration does not map stays as that
 * identifier, drawn in mono (`mono` true). Console code never words a pack's tokens itself.
 */
export interface OutcomeWords {
  text: string;
  mono: boolean;
}

/** A step that recorded an outcome in a round, with that outcome as a person reads it. */
export interface TimelineStep {
  node: string;
  outcome: OutcomeWords;
  summary: string | null;
}

export interface TimelineGroup {
  /** The declared stage the steps belong to, as `stageOfWorkflow` places a step. */
  label: string;
  steps: TimelineStep[];
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
  /** How the run ended, or what it is doing (`runOutcome`). */
  outcome: OutcomeWords;
  /** Null for a run that has not started executing. */
  durationMs: number | null;
  costUsd: number | null;
  /** The running step while the run runs. */
  liveStep: string | null;
  rounds: TimelineRound[];
}

export const runHref = (projectId: string, runId: string): string =>
  `/console/p/${projectId}/r/${runId}`;

const words = (text: string): OutcomeWords => ({ text, mono: false });

/**
 * A completed run's outcome: where `placement` sent the item ("sent to Plan"), the label of
 * the `endings` entry that closed it, else the pack's token as an identifier.
 */
function completedOutcome(view: Declaration, workflow: string | null, outcome: string | null) {
  if (outcome === null) return words('completed');
  if (workflow === null) return { text: outcome, mono: true };
  const placed = view.placement[`${workflow}:${outcome}`];
  const stage = view.stages.find(candidate => candidate.id === placed);
  if (stage !== undefined) return words(`sent to ${stage.label}`);
  const ending = view.endings[`${workflow}:${outcome}`] ?? view.endings[`${workflow}:*`];
  return ending === undefined ? { text: outcome, mono: true } : words(ending);
}

/** How a run ended, or what it is doing; `workflow` as the view names it, null if it does not. */
function runOutcome(view: Declaration, workflow: string | null, run: ItemRun): OutcomeWords {
  if (run.awaitingExecution !== null) return words('waiting to start');
  switch (run.status) {
    case 'pending':
      return words('waiting to start');
    case 'running':
    case 'paused':
    case 'failed':
    case 'cancelled':
      return words(run.status);
    case 'completed':
      return completedOutcome(view, workflow, run.outcome);
  }
}

/**
 * A step's outcome in a round: "returned" or "approved" where `returns` or `approves`
 * declares that step and outcome, else the pack's token as an identifier.
 */
function stepOutcome(view: Declaration, workflow: string, step: RoundStep): OutcomeWords {
  const declares = (points: Declaration['returns']): boolean =>
    (points ?? []).some(
      point =>
        point.workflow === workflow && point.node === step.node && point.outcome === step.outcome
    );
  if (declares(view.returns)) return words(VERDICT_LABEL.returned);
  if (declares(view.approves)) return words(VERDICT_LABEL.approved);
  return { text: step.outcome, mono: true };
}

/** A round's steps grouped under the stage each belongs to, in the order they recorded. */
function groupSteps(view: Declaration, workflow: string, steps: readonly RoundStep[]) {
  const groups: TimelineGroup[] = [];
  for (const step of steps) {
    const label = stageOfWorkflow(view, workflow, step.node)?.label ?? workflow;
    const entry = {
      node: step.node,
      outcome: stepOutcome(view, workflow, step),
      summary: step.summary,
    };
    const last = groups.at(-1);
    if (last?.label === label) last.steps.push(entry);
    else groups.push({ label, steps: [entry] });
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
      const after = `After ${before.stage ?? before.workflow}:`;
      return before.outcome.mono
        ? { text: after, mono: before.outcome.text, runHref: href }
        : { text: `${after} ${before.outcome.text}`, mono: null, runHref: href };
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
      outcome: runOutcome(view, workflow, run),
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
