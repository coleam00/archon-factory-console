import type { FactoryViewListed } from './views';

export type FactoryStage = FactoryViewListed['declaration']['stages'][number];

/**
 * The workflows `stage` draws: those it lists that the view has not retired. A retired
 * workflow still places and tells its old runs (so every placement reader keeps
 * `stage.workflows`), but the pack has nothing of it to draw.
 */
export function liveWorkflows(
  view: Pick<FactoryViewListed['declaration'], 'retired'>,
  stage: Pick<FactoryStage, 'workflows'>
): string[] {
  return stage.workflows.filter(workflow => view.retired?.includes(workflow) !== true);
}

/** The stages that list `workflow`, in the view's order. */
export function stagesOfWorkflow(
  stages: readonly FactoryStage[],
  workflow: string
): FactoryStage[] {
  return stages.filter(stage => stage.workflows.includes(workflow));
}
