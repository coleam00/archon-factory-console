import type { FactoryItem } from '../../skills/factory';
import { stagesOfWorkflow, stepInStage, type FactoryStage } from './stage-steps';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type RunStatus = FactoryItem['runs'][number]['status'];

/**
 * One of an item's runs as placement reads it, in start order. `workflow` is the workflow as
 * the view declares it, null for a run of a workflow the view does not name; `step` is the
 * deepest running step while it runs; `failedStep` the step a failed run failed at.
 */
export interface PlacementRun {
  workflow: string | null;
  status: RunStatus;
  outcome: string | null;
  step: string | null;
  failedStep: string | null;
}

export interface PlacementInput {
  runs: readonly PlacementRun[];
  /** Whether the item's change merged; null when it has none. */
  merged: boolean | 'unknown' | null;
  /** Whether an open ask or paused wait on the item needs a person. */
  needsYou: boolean;
}

/** What placement reads of each run beyond the item read's own: its declared workflow and running step. */
export type RunFacts = ReadonlyMap<string, { workflow: string | null; step: string | null }>;

/**
 * Placement's input for an item: its runs in the item read's order joined with `facts` by
 * id (a run without facts is of no declared workflow), and its change's merge state. Every
 * view that places an item builds its input here, so they place it alike. The failed step
 * comes from the item's own `progress.runs`, which the board, map and item page all hold.
 */
export function placementInput(
  item: FactoryItem,
  facts: RunFacts,
  needsYou: boolean
): PlacementInput {
  const failedAt = new Map((item.progress?.runs ?? []).map(run => [run.runId, run.failedStep]));
  return {
    runs: item.runs.map(run => {
      const fact = facts.get(run.id);
      return {
        workflow: fact?.workflow ?? null,
        status: run.status,
        outcome: run.outcome,
        step: fact?.step ?? null,
        failedStep: failedAt.get(run.id) ?? null,
      };
    }),
    merged: item.progress?.change?.merged ?? null,
    needsYou,
  };
}

/** The run facts one entry of the items read carries: `progress.runs`, with the running run's step. */
export function pageRunFacts(progress: NonNullable<FactoryItem['progress']>): RunFacts {
  const { running } = progress;
  return new Map(
    progress.runs.map(run => [
      run.runId,
      { workflow: run.workflow, step: run.runId === running?.runId ? running.step : null },
    ])
  );
}

/** Where an item sits: a stage's column, or ended without a change (DESIGN board rule 4). */
export type ItemColumn = { stage: FactoryStage } | { ended: string };

export type ItemState = 'running' | 'needs-you' | 'failed' | 'waiting' | 'landed';

/** The state pill's words (DESIGN "A card"). */
export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  running: 'Running',
  'needs-you': 'Needs you',
  failed: 'Failed',
  waiting: 'Waiting',
  landed: 'Landed',
};

/**
 * The stage of `workflow` that names `step` among its declared `nodes`; undefined when none
 * does. A stage without `nodes` holds every step of its workflow (`stepInStage`), so it is
 * not counted as naming one here: it is the fallback `stageOfWorkflow` picks.
 */
export function stageOfStep(
  view: Declaration,
  workflow: string,
  step: string
): FactoryStage | undefined {
  return stagesOfWorkflow(view.stages, workflow).find(
    stage => stage.nodes !== undefined && stepInStage(stage, step)
  );
}

/**
 * The stage a step or running run of `workflow` counts in: the stage whose `nodes` name the
 * step; else the first of the workflow's stages that declares no `nodes` (it holds every
 * step); else its first stage. A run between steps (`step` null) sits where the workflow starts.
 */
export function stageOfWorkflow(
  view: Declaration,
  workflow: string,
  step: string | null
): FactoryStage | undefined {
  const byStep = step === null ? undefined : stageOfStep(view, workflow, step);
  if (byStep !== undefined) return byStep;
  const stages = stagesOfWorkflow(view.stages, workflow);
  return stages.find(stage => stage.nodes === undefined) ?? stages[0];
}

const TERMINAL: ReadonlySet<RunStatus> = new Set(['completed', 'failed', 'cancelled']);

type DeclaredRun = PlacementRun & { workflow: string };

function declaredRuns(runs: readonly PlacementRun[]): DeclaredRun[] {
  return runs.filter((run): run is DeclaredRun => run.workflow !== null);
}

/** The ending label for a completed run, from `endings` (`workflow:outcome` or `workflow:*`). */
function endingOf(view: Declaration, run: DeclaredRun): string | undefined {
  if (run.status !== 'completed' || run.outcome === null) return undefined;
  return view.endings[`${run.workflow}:${run.outcome}`] ?? view.endings[`${run.workflow}:*`];
}

/** The landed column's stage. */
function landedStage(view: Declaration): FactoryStage | undefined {
  return view.stages.find(stage => stage.id === view.landed.stage);
}

/**
 * The stage a running run puts its item in: the stage holding its step (`nodes` name it, or
 * a stage of the workflow declares no `nodes`). On a step no stage names (a loop group
 * between rounds, or none between steps) the item stays in `previous`, the stage it sat in
 * on the last read, when that stage lists the workflow, so a card does not hop; else it goes
 * where the workflow starts.
 */
function runningStage(
  view: Declaration,
  run: DeclaredRun,
  previous: string | undefined
): FactoryStage | undefined {
  const stages = stagesOfWorkflow(view.stages, run.workflow);
  const named = run.step === null ? undefined : stageOfStep(view, run.workflow, run.step);
  return (
    named ??
    stages.find(stage => stage.nodes === undefined) ??
    stages.find(stage => stage.id === previous) ??
    stages[0]
  );
}

/**
 * Where an item sits: DESIGN's placement rules, first that matches. The board, the map and
 * the item page all place through here. `previous` is the stage the item sat in on the
 * caller's last read, if it keeps one (the board does).
 */
export function itemColumn(
  view: Declaration,
  input: PlacementInput,
  previous?: string
): ItemColumn | null {
  const runs = declaredRuns(input.runs);
  const stageOf = (stage: FactoryStage | undefined): ItemColumn | null =>
    stage === undefined ? null : { stage };
  // 1. A run works it: the stage its running step is in.
  const running = runs.filter(run => run.status === 'running').at(-1);
  if (running !== undefined) return stageOf(runningStage(view, running, previous));
  // 2. Its change merged.
  if (input.merged === true) return stageOf(landedStage(view));
  // 3. The last completed run's `workflow:outcome` is placed.
  const completed = runs.filter(run => run.status === 'completed').at(-1);
  const placed =
    completed?.outcome === null || completed === undefined
      ? undefined
      : view.placement[`${completed.workflow}:${completed.outcome}`];
  if (placed !== undefined) return stageOf(view.stages.find(stage => stage.id === placed));
  const last = runs.filter(run => TERMINAL.has(run.status)).at(-1);
  // 4. The last run ended the item without a change.
  const ending = last === undefined ? undefined : endingOf(view, last);
  if (ending !== undefined) return { ended: ending };
  // 5. The last run failed or was cancelled: the stage whose `nodes` name the step it failed
  // at, else its workflow's first stage.
  if (last !== undefined && last.status !== 'completed') {
    const atStep =
      last.failedStep === null ? undefined : stageOfStep(view, last.workflow, last.failedStep);
    return stageOf(atStep ?? stagesOfWorkflow(view.stages, last.workflow)[0]);
  }
  // 6. Otherwise the first stage.
  return stageOf(view.stages[0]);
}

/** The item's state pill. */
export function itemState(input: PlacementInput): ItemState {
  const runs = declaredRuns(input.runs);
  if (runs.some(run => run.status === 'running')) return 'running';
  if (input.needsYou) return 'needs-you';
  if (input.merged === true) return 'landed';
  const last = runs.filter(run => TERMINAL.has(run.status)).at(-1);
  if (last !== undefined && last.status !== 'completed') return 'failed';
  return 'waiting';
}

/**
 * Where an entry of the items read sits: the board and the map both place through here, so
 * a column and a card never name different stages. `previous` is the stage the item sat in
 * on the caller's last read. An item whose progress could not be read has no declared runs
 * here, so it sits in the first stage (rule 6). Placement does not read `needsYou`.
 */
export function pageItemColumn(
  view: Declaration,
  item: FactoryItem,
  previous?: string
): ItemColumn | null {
  const facts: RunFacts = item.progress === null ? new Map() : pageRunFacts(item.progress);
  return itemColumn(view, placementInput(item, facts, false), previous);
}

/** The stage a placement put an item in; undefined when it is off the board or unplaced. */
export function stageIdOf(column: ItemColumn | null): string | undefined {
  return column !== null && 'stage' in column ? column.stage.id : undefined;
}
