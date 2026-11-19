import type { FactoryItemDetail } from '../../skills/factory';
import { placedStage, stageOfWorkflow } from './placement';
import { shadowOf, shadowWords, type ShadowWords } from './shadows';
import { VERDICT_LABEL, type RoundVerdict } from './board';
import { stepLabel } from './step-label';
import { FOUND_BY_THE_FACTORY_LABEL } from './discoveries';
import { boardSeats, isSendBack, type Seat } from './stage-direction';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
/** What a declared step outcome means (`verdicts`); the console words each one. */
type VerdictMeaning = NonNullable<Declaration['verdicts']>[string][string][string];
type ItemRun = FactoryItemDetail['item']['runs'][number];
type RunFacts = FactoryItemDetail['runs'][number];
type Round = NonNullable<RunFacts['rounds']>['rounds'][number];
export type RoundStep = Round['steps'][number];
/** What started a run; absent for a start by hand. */
type StartCause = RunFacts['cause'];

/**
 * How a run started, in words. `mono` follows the words in mono: the outcome token of the
 * run before, where the declaration does not word it. `title` is the hover text: the trigger's
 * id, which no person reads on the page. `step` is the step that started it, by name, with its
 * engine id for the hover title. `runHref` links the run that caused it.
 */
export interface StartedText {
  text: string;
  mono: string | null;
  title: string | null;
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
  /** The verdict its outcome declares, for its chip's colour; null for an undeclared token. */
  verdict: RoundVerdict | null;
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

/** One decision a shadow step recorded on a run: what it would have done. */
export interface TimelineShadow {
  /** The run, step and round, unique on the run. */
  key: string;
  /** The shadow's declared label, else the step's engine id. */
  label: string;
  /** The loop round it decided in; null outside a loop. */
  round: number | null;
  words: ShadowWords;
}

/**
 * What a run's outcome did to the item, for its icon and colour. Derived from the same
 * branches as its words, never from the words: `sent-on` and `returned` by where `placement`
 * put the item, forward or back by the board's order (`isSendBack`, the rule the map's arrows
 * follow).
 */
export type RunKind = 'sent-on' | 'returned' | 'asked' | 'failed' | 'running' | 'stopped' | 'other';

/** A stage group, for the run's dot; `shadow` for a run that only decides what it would do. */
export type RunGroup = Declaration['stages'][number]['group'] | 'shadow';

export interface TimelineRow {
  runId: string;
  href: string;
  /** The workflow as the view names it, else as the run recorded it. */
  workflow: string;
  /** The declared stage it worked, or "Found by the factory" for a discoveries run. */
  stage: string | null;
  /** The colour group of its dot; null for a run on no stage. */
  group: RunGroup | null;
  started: StartedText;
  status: ItemRun['status'];
  /** How the run ended, or what it is doing (`runOutcome`). */
  outcome: OutcomeWords;
  kind: RunKind;
  /** The questions this run left on the item, for the hover of an outcome that reads "asked you". */
  asked: string[];
  /** Null for a run that has not started executing. */
  durationMs: number | null;
  costUsd: number | null;
  /** The running step's engine id while the run runs, for the hover title. */
  liveStep: string | null;
  /** The running step's name, with its round when it is of the rounds loop. */
  liveStepName: string | null;
  rounds: TimelineRound[];
  /** What the shadow steps the view declares decided on this run, in recording order. */
  shadows: TimelineShadow[];
}

export const runHref = (projectId: string, runId: string): string =>
  `/console/p/${projectId}/r/${runId}`;

const words = (text: string): OutcomeWords => ({ text, mono: false });

/** An outcome's words with what it did to the item. */
type Outcome = { words: OutcomeWords; kind: RunKind };
const outcome = (text: string, kind: RunKind): Outcome => ({ words: words(text), kind });
const token = (text: string): Outcome => ({ words: { text, mono: true }, kind: 'other' });

/** The timeline's words for a run that stopped to ask, and for a step outcome meaning `asked`. */
const ASKED_YOU = 'asked you';

/** Each declared meaning as the verdict whose colour its chip takes. */
const MEANING_VERDICT: Record<VerdictMeaning, RoundVerdict> = {
  approved: 'approved',
  returned: 'returned',
  asked: 'undecided',
};

/** Each declared meaning in the board's round-dot words, and "asked you" for an ask. */
const MEANING_WORDS: Record<VerdictMeaning, string> = {
  approved: VERDICT_LABEL.approved,
  returned: VERDICT_LABEL.returned,
  asked: ASKED_YOU,
};

/**
 * The questions a run left on the item: its answered or withdrawn asks, then its open ones.
 * An open question counts only by `askedIn`; a gate's own question names its run in `run`,
 * and that is not an ask the run left.
 */
function askedQuestions(detail: FactoryItemDetail, runId: string): string[] {
  const closed = detail.item.answers.flatMap(answer =>
    answer.kind === 'ask' && answer.runId === runId ? [answer.question] : []
  );
  const open = detail.item.questions.flatMap(question =>
    question.kind === 'attention' && question.askedIn?.runId === runId ? [question.message] : []
  );
  return [...closed, ...open];
}

/**
 * Whether `asked` declares this completed outcome, exactly or by `workflow:*`. As in
 * `endings`, `*` takes every outcome, not a run that recorded none.
 */
const declaredAsked = (view: Declaration, workflow: string, outcome: string | null): boolean =>
  outcome !== null &&
  (view.asked ?? []).some(key => key === `${workflow}:*` || key === `${workflow}:${outcome}`);

/**
 * A completed run's outcome: "asked you" when it stopped to ask (a declared `asked` outcome,
 * or asks it left on the item), else where `placement` sent the item ("sent to Plan"), the
 * label of the `endings` entry that closed it, else the pack's token as an identifier.
 */
function completedOutcome(
  view: Declaration,
  workflow: string | null,
  result: string | null,
  asked: readonly string[]
): Outcome {
  if (asked.length > 0 || (workflow !== null && declaredAsked(view, workflow, result)))
    return outcome(ASKED_YOU, 'asked');
  const stage = workflow === null ? undefined : placedStage(view, workflow, result);
  if (workflow !== null && stage !== undefined)
    return outcome(`sent to ${stage.label}`, placedKind(view, workflow, stage.id));
  if (result === null) return outcome('completed', 'other');
  if (workflow === null) return token(result);
  const ending = view.endings[`${workflow}:${result}`] ?? view.endings[`${workflow}:*`];
  return ending === undefined ? token(result) : outcome(ending, 'stopped');
}

/**
 * Whether placing the item in `stage` after a run of `workflow` sent it back or on, by the
 * board's order (`isSendBack`, the map's rule). A run is judged from the furthest stage its
 * workflow works, since it may have reached any of them: `deliver:returned` lands in Build
 * from Checks, `deliver:replan` in Plan. A placement into that furthest stage itself is no
 * send-back: the land gate places the item in Ready to merge, the stage it works.
 */
function placedKind(view: Declaration, workflow: string, stage: string): RunKind {
  const seats = boardSeats(view);
  const to = seats.get(stage);
  const from = view.stages
    .filter(candidate => candidate.workflows.includes(workflow))
    .map(candidate => seats.get(candidate.id))
    .reduce<Seat | undefined>(
      (furthest, seat) =>
        seat === undefined || (furthest !== undefined && isSendBack(furthest, seat))
          ? furthest
          : seat,
      undefined
    );
  if (from === undefined || to === undefined) return 'sent-on';
  const same = from.card === to.card && from.row === to.row;
  return !same && isSendBack(from, to) ? 'returned' : 'sent-on';
}

/** How a run ended, or what it is doing; `workflow` as the view names it, null if it does not. */
function runOutcome(
  view: Declaration,
  workflow: string | null,
  run: ItemRun,
  asked: readonly string[]
): Outcome {
  if (run.awaitingExecution !== null) return outcome('waiting to start', 'other');
  switch (run.status) {
    case 'pending':
      return outcome('waiting to start', 'other');
    case 'running':
    case 'paused':
      return outcome(run.status, 'running');
    case 'failed':
    case 'cancelled':
      return outcome(run.status, 'failed');
    case 'completed':
      return completedOutcome(view, workflow, run.outcome, asked);
  }
}

/**
 * A step's outcome in a round: "returned" or "approved" where `returns` or `approves`
 * declares that step and outcome, its meaning's words where `verdicts` does, else the pack's
 * token as an identifier.
 */
function stepOutcome(
  view: Declaration,
  workflow: string,
  step: RoundStep
): { outcome: OutcomeWords; verdict: RoundVerdict | null } {
  const declares = (points: Declaration['returns']): boolean =>
    (points ?? []).some(
      point =>
        point.workflow === workflow && point.node === step.node && point.outcome === step.outcome
    );
  if (declares(view.returns))
    return { outcome: words(VERDICT_LABEL.returned), verdict: 'returned' };
  if (declares(view.approves))
    return { outcome: words(VERDICT_LABEL.approved), verdict: 'approved' };
  const meaning = view.verdicts?.[workflow]?.[step.node]?.[step.outcome];
  return meaning === undefined
    ? { outcome: { text: step.outcome, mono: true }, verdict: null }
    : { outcome: words(MEANING_WORDS[meaning]), verdict: MEANING_VERDICT[meaning] };
}

/** A round's steps grouped under the stage each belongs to, in the order they recorded. */
function groupSteps(view: Declaration, workflow: string, steps: readonly RoundStep[]) {
  const groups: TimelineGroup[] = [];
  for (const step of steps) {
    const label = stageOfWorkflow(view, workflow, step.node)?.label ?? workflow;
    const entry = {
      node: step.node,
      name: stepLabel(view, workflow, step.node),
      ...stepOutcome(view, workflow, step),
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

function timelineShadows(view: Declaration, fact: RunFacts | undefined): TimelineShadow[] {
  return (fact?.shadows ?? []).map(decision => {
    const shadow = shadowOf(view, decision.workflow, decision.node);
    return {
      key: `${decision.runId}|${decision.node}|${String(decision.round)}`,
      label: shadow?.label ?? decision.node,
      round: decision.round,
      words: shadowWords(shadow, decision),
    };
  });
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
  title: null,
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
      return { ...started('Started by a trigger', null), title: cause.sourceInstanceId };
  }
}

/**
 * Where a run sits on the timeline: the stage it worked and that stage's group, or, for a run
 * of the view's discoveries workflow (on no stage), "Found by the factory", a shadow while the
 * view says the drain only decides what it would file.
 */
function runPlace(
  view: Declaration,
  workflow: string | null,
  liveStep: string | null
): { stage: string | null; group: RunGroup | null } {
  if (workflow === null) return { stage: null, group: null };
  if (view.discoveries !== undefined && workflow === view.discoveries.workflow)
    return {
      stage: FOUND_BY_THE_FACTORY_LABEL,
      group: view.discoveries.shadow ? 'shadow' : null,
    };
  const stage = stageOfWorkflow(view, workflow, liveStep);
  return { stage: stage?.label ?? null, group: stage?.group ?? null };
}

/** The timeline's last entry once the change merged: when, as the change host said. */
export interface TimelineMerged {
  /** ISO time it merged; null when the host did not say. */
  at: string | null;
}

/** The merged entry, when the item's change merged; null otherwise. */
export function timelineMerged(detail: FactoryItemDetail): TimelineMerged | null {
  const change = detail.item.progress?.change ?? null;
  return change?.merged === true ? { at: change.mergedAt } : null;
}

/**
 * The item page's timeline: one row per run in the item read's order (start order), each
 * with the declared rounds loop's rounds and its shadow decisions under it.
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
    const asked = askedQuestions(detail, run.id);
    const result = runOutcome(view, workflow, run, asked);
    return {
      runId: run.id,
      href: runHref(projectId, run.id),
      workflow: workflow ?? run.workflow,
      ...runPlace(view, workflow, liveStep),
      status: run.status,
      outcome: result.words,
      kind: result.kind,
      asked,
      durationMs: durationOf(run, now),
      costUsd: fact?.costUsd ?? null,
      liveStep,
      liveStepName:
        liveStep === null ? null : stepLabel(view, workflow ?? run.workflow, liveStep, iteration),
      rounds: workflow === null ? [] : timelineRounds(view, workflow, fact?.rounds ?? null),
      // Not gated on a declared workflow: the discoveries workflow is on no stage.
      shadows: timelineShadows(view, fact),
      cause: fact?.cause,
    };
  });
  return rows.map(row => {
    const { cause: _cause, ...rest } = row;
    return { ...rest, started: startedText(view, projectId, row, rows) };
  });
}
