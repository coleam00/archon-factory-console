import type { FactoryViewListed } from './views';

export type FactoryStage = FactoryViewListed['declaration']['stages'][number];

/**
 * Whether a step of one of `stage`'s workflows belongs to the stage. A stage without
 * `nodes` holds every step; with them, a step belongs when its key is a listed node or
 * begins with one followed by `.`, so `rounds` holds `rounds.fix`.
 */
export function stepInStage(stage: Pick<FactoryStage, 'nodes'>, stepKey: string): boolean {
  if (stage.nodes === undefined) return true;
  return stage.nodes.some(node => stepKey === node || stepKey.startsWith(`${node}.`));
}

/** The stages that list `workflow`, in the view's order. */
export function stagesOfWorkflow(
  stages: readonly FactoryStage[],
  workflow: string
): FactoryStage[] {
  return stages.filter(stage => stage.workflows.includes(workflow));
}
