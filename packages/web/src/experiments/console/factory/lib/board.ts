/**
 * Where an item stands in a factory: the one placement the board, the map and the numbers
 * strip all read, so no two views of the factory can disagree on it. Derived from the item's
 * progress and the view's declaration only (DESIGN.md, "The board"); nothing stores a column.
 */
import type { FactoryItemsPage } from '../../skills/factory';
import type { FactoryViewListed } from './views';

export type Declaration = FactoryViewListed['declaration'];
export type FactoryStage = Declaration['stages'][number];
export type FactoryItem = FactoryItemsPage['items'][number];
type Progress = NonNullable<FactoryItem['progress']>;

export type Placement =
  /** In a stage's column; `working` while a run works the item in it now. */
  | { kind: 'stage'; stage: string; working: boolean }
  /** Ended without a change (`endings`): on no column, under the board's folded row `label`. */
  | { kind: 'ended'; label: string }
  /**
   * Nowhere: the server could not derive the item's progress, or the run it would be placed
   * by is of a workflow no stage lists. Shown as such, never guessed onto a stage.
   */
  | { kind: 'unplaced'; reason: 'no-progress' | 'no-stage' };

/** A step matches a `nodes` entry equal to it, or one it begins with followed by `.`. */
function stepMatches(step: string, entry: string): boolean {
  return step === entry || step.startsWith(`${entry}.`);
}

function firstStageOf(view: Declaration, workflow: string): FactoryStage | undefined {
  return view.stages.find(stage => stage.workflows.includes(workflow));
}

/**
 * The stage a running run works the item in: the first whose workflows hold the run's and
 * whose `nodes`, when given, cover its step. Between steps (`step` null), or on a step no
 * stage's `nodes` cover, the run is still real, so the item goes to the first stage that
 * lists the workflow rather than off the map.
 */
function runningStage(view: Declaration, running: NonNullable<Progress['running']>): Placement {
  const { workflow, step } = running;
  const covering =
    step === null
      ? undefined
      : view.stages.find(
          stage =>
            stage.workflows.includes(workflow) &&
            (stage.nodes === undefined || stage.nodes.some(entry => stepMatches(step, entry)))
        );
  const stage = covering ?? firstStageOf(view, workflow);
  return stage === undefined
    ? { kind: 'unplaced', reason: 'no-stage' }
    : { kind: 'stage', stage: stage.id, working: true };
}

/** Where the item's last ended run left it, by the declaration's `placement` and `endings`. */
function endedPlacement(view: Declaration, ended: NonNullable<Progress['ended']>): Placement {
  const { workflow, outcome, status } = ended;
  if (status === 'completed') {
    const key = `${workflow}:${outcome ?? ''}`;
    const placed = outcome === null ? undefined : view.placement[key];
    if (placed !== undefined) return { kind: 'stage', stage: placed, working: false };
    const label =
      (outcome === null ? undefined : view.endings[key]) ?? view.endings[`${workflow}:*`];
    if (label !== undefined) return { kind: 'ended', label };
    return idle(view);
  }
  // Failed or cancelled: the stage of that run's workflow, where it stopped.
  const stage = firstStageOf(view, workflow);
  return stage === undefined
    ? { kind: 'unplaced', reason: 'no-stage' }
    : { kind: 'stage', stage: stage.id, working: false };
}

/** Nothing placed the item: the first stage, waiting. */
function idle(view: Declaration): Placement {
  // The schema requires at least one stage.
  const [first] = view.stages;
  return first === undefined
    ? { kind: 'unplaced', reason: 'no-stage' }
    : { kind: 'stage', stage: first.id, working: false };
}

/**
 * Where one item stands, the first rule that matches (DESIGN.md, "The board"):
 * 1. a declared run works it now: the stage covering that run's workflow and step;
 * 2. its change merged: the landed stage;
 * 3. its last ended run completed with a `placement` outcome: that stage;
 * 4. that outcome is in `endings` (or `workflow:*` is): off the board, under its label;
 * 5. that run failed or was cancelled: the first stage of its workflow;
 * 6. otherwise the first stage.
 * A paused run is neither running nor ended, so a paused item keeps the place its previous
 * run left it; the Needs-you list carries the wait.
 */
export function placeItem(view: Declaration, item: FactoryItem): Placement {
  const { progress } = item;
  if (progress === null) return { kind: 'unplaced', reason: 'no-progress' };
  if (progress.running !== null) return runningStage(view, progress.running);
  if (progress.change?.merged === true)
    return { kind: 'stage', stage: view.landed.stage, working: false };
  if (progress.ended !== null) return endedPlacement(view, progress.ended);
  return idle(view);
}
