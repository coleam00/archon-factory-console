/**
 * Which declared stage a step of a workflow counts in, for the item page's timeline. Where
 * an item sits, and its pill, are the board's (`board.ts`).
 */
import { stagesOfWorkflow, stepInStage, type FactoryStage } from './stage-steps';
import type { FactoryViewListed } from './views';

type Declaration = FactoryViewListed['declaration'];

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
