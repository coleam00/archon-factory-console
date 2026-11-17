import type { FactoryItemDetail } from '../../skills/factory';
import { placedStage, stageOfWorkflow } from './placement';
import { VERDICT_LABEL, type RoundVerdict } from './board';
import { stepLabel } from './step-label';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type ItemRun = FactoryItemDetail['item']['runs'][number];
type RunFacts = FactoryItemDetail['runs'][number];
type Round = NonNullable<RunFacts['rounds']>['rounds'][number];
export type RoundStep = Round['steps'][number];
/** What started a run; absent for a start by hand. */
type StartCause = RunFacts['cause'];

/**
 * How a run started, in words. `mono` follows the words in mono: the trigger's id. `step`
 * is the step that started it, by name, with its engine id for the hover title. `runHref`
 * links the run that caused it.
 */
export interface StartedText {
  text: string;
  mono: string | null;
  step: { name: string; node: string } | null;
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
  /** The engine id, for keys and the hover title. */
  node: string;
  /** The step's name (`stepLabel`); no round, as it sits under its round already. */
  name: string;
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
  /** The running step's engine id while the run runs, for the hover title. */
  liveStep: string | null;
  /** The running step's name, with its round when it is of the rounds loop. */
  liveStepName: string | null;
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
  const stage = workflow === null ? undefined : placedStage(view, workflow, outcome);
  if (stage !== undefined) return words(`sent to ${stage.label}`);
  if (outcome === null) return words('completed');
  if (workflow === null) return { text: outcome, mono: true };
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
      name: stepLabel(view, workflow, step.node),
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

const started = (text: string, runHref: string | null): StartedText => ({
  text,
  mono: null,
  step: null,
  runHref,
});

function startedText(
  view: Declaration,
  projectId: string,
  row: Row,
  rows: readonly Row[]
): StartedText {
  const { cause } = row;
  if (cause === undefined) return started('Started by hand', null);
  switch (cause.kind) {
    case 'run_ended': {
      const href = runHref(projectId, cause.runId);
      const before = rows.find(other => other.runId === cause.runId);
      if (before === undefined) return started('After another run', href);
      const after = `After ${before.stage ?? before.workflow}:`;
      return before.outcome.mono
        ? { ...started(after, href), mono: before.outcome.text }
        : started(`${after} ${before.outcome.text}`, href);
    }
    case 'run_fired': {
      const href = runHref(projectId, cause.runId);
      // Naming the step needs its workflow, which only the firing run's row says.
      const firing = rows.find(other => other.runId === cause.runId);
      if (cause.node === null || firing === undefined)
        return started('Started by another run', href);
      const name = stepLabel(view, firing.workflow, cause.node);
      return { ...started('Started by step', href), step: { name, node: cause.node } };
    }
    case 'asks_settled':
      return started('After its questions were settled', runHref(projectId, cause.runId));
    case 'receipt':
      return { ...started('Started by a trigger', null), mono: cause.sourceInstanceId };
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
    const iteration = fact?.rounds?.rounds.at(-1)?.iteration;
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
      liveStepName:
        liveStep === null ? null : stepLabel(view, workflow ?? run.workflow, liveStep, iteration),
      rounds: workflow === null ? [] : timelineRounds(view, workflow, fact?.rounds ?? null),
      cause: fact?.cause,
    };
  });
  return rows.map(row => {
    const { cause: _cause, ...rest } = row;
    return { ...rest, started: startedText(view, projectId, row, rows) };
  });
}
