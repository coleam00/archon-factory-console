import type { FactoryItem } from '../../skills/factory';
import { stagesOfWorkflow, stepInStage, type FactoryStage } from './stage-steps';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];
type RunStatus = FactoryItem['runs'][number]['status'];

/**
 * One of an item's runs as placement reads it, in start order. `workflow` is the workflow as
 * the view declares it, null for a run of a workflow the view does not name; `step` is the
 * deepest running step while it runs.
 */
export interface PlacementRun {
  workflow: string | null;
  status: RunStatus;
  outcome: string | null;
  step: string | null;
}

export interface PlacementInput {
  runs: readonly PlacementRun[];
  /** Whether the item's change merged; null when it has none. */
  merged: boolean | 'unknown' | null;
  /** Whether an open ask or paused wait on the item needs a person. */
  needsYou: boolean;
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

/** Where an item sits on the board: DESIGN's placement rules, first that matches. */
export function itemColumn(view: Declaration, input: PlacementInput): ItemColumn | null {
  const runs = declaredRuns(input.runs);
  const stageOf = (stage: FactoryStage | undefined): ItemColumn | null =>
    stage === undefined ? null : { stage };
  // 1. A run works it: the stage its running step is in.
  const running = runs.filter(run => run.status === 'running').at(-1);
  if (running !== undefined) return stageOf(stageOfWorkflow(view, running.workflow, running.step));
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
  // 5. The last run failed or was cancelled: the stage of its workflow.
  if (last !== undefined && last.status !== 'completed')
    return stageOf(stageOfWorkflow(view, last.workflow, null));
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
