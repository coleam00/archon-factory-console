/**
 * The pack's own words, read from its pack graph, laid over its factory view file. A stage's
 * label, short line and blurb, a step's label and an outcome's label and story are authored in
 * the pack's workflow YAML (`display:`) and served on the graph's stages, nodes and outcomes.
 * The graph wins; what it does not carry stays as the file has it, and a name neither gives
 * reads as its id where it is drawn. Pure, and applied once wherever a view meets its graph, so
 * every reader of `FactoryView` sees the same words.
 */
import type { PackGraph } from '../../skills/items';
import type { FactoryView } from '../api';

type Stage = FactoryView['stages'][string];
type Outcome = NonNullable<FactoryView['outcomes']>[string];

function stageWords(
  stage: PackGraph['stages'][number],
  file: Stage | undefined
): Stage | undefined {
  const steps: Record<string, string> = { ...file?.steps };
  for (const node of stage.nodes)
    if (node.display !== undefined) steps[node.id] = node.display.label;
  if (stage.display === undefined && Object.keys(steps).length === 0) return file;
  return {
    ...file,
    ...stage.display,
    ...(Object.keys(steps).length === 0 ? {} : { steps }),
  };
}

export function withGraphWords(view: FactoryView, stages: PackGraph['stages']): FactoryView {
  const words = { ...view.stages };
  const outcomes: Record<string, Outcome> = { ...view.outcomes };
  for (const stage of stages) {
    const merged = stageWords(stage, words[stage.workflow]);
    if (merged !== undefined) words[stage.workflow] = merged;
    for (const value of stage.outcome?.values ?? []) {
      if (value.display === undefined) continue;
      const key = `${stage.workflow}:${value.value}`;
      outcomes[key] = { ...outcomes[key], ...value.display };
    }
  }
  return {
    ...view,
    stages: words,
    ...(Object.keys(outcomes).length === 0 ? {} : { outcomes }),
  };
}
