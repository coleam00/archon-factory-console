import type { ReactElement } from 'react';
import type { PackGraph } from '../../skills/items';
import type { CuratedView } from '../lib/curated-view';

type GraphStage = PackGraph['stages'][number];
type Story = NonNullable<NonNullable<GraphStage['outcome']>['values'][number]['display']>['story'];

/** One way a run of the stage ends, as a person reads it. */
export interface StageOutcome {
  value: string;
  label: string;
  /** The run's story when it ends so; the with-a-change form of a two-form story. */
  story: string | undefined;
}

const storyLine = (story: Story): string | undefined =>
  typeof story === 'object' ? story.withChange : story;

/**
 * Every outcome a run of the stage's workflows can end with, in the graph's order: its label
 * from the curated view (the graph's `display:` first) or its value, and the story its
 * `display:` gives it. It lists what no arrow carries too, such as an outcome that waits on
 * the operator.
 */
export function stageOutcomes(
  view: Pick<CuratedView, 'outcomeLabels'>,
  graph: PackGraph | undefined,
  workflows: readonly string[]
): StageOutcome[] {
  return workflows.flatMap(workflow => {
    const stage = graph?.stages.find(entry => entry.workflow === workflow);
    return (stage?.outcome?.values ?? []).map(({ value, display }) => ({
      value,
      label: view.outcomeLabels[`${workflow}:${value}`] ?? value,
      story: display?.story === undefined ? undefined : storyLine(display.story),
    }));
  });
}

/**
 * "How a run here ends": each outcome of the stage with its story, under where items go. Nothing
 * while the graph is read, or when the stage declares no outcome.
 */
export function StageOutcomes({
  view,
  graph,
  workflows,
}: {
  view: Pick<CuratedView, 'outcomeLabels'>;
  graph: PackGraph | undefined;
  workflows: readonly string[];
}): ReactElement | null {
  const outcomes = stageOutcomes(view, graph, workflows);
  if (outcomes.length === 0) return null;
  return (
    <section aria-label="How a run here ends" className="flex flex-col gap-1.5">
      <h4 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        How a run here ends
      </h4>
      <ul className="flex flex-col gap-0.5">
        {outcomes.map(outcome => (
          <li
            key={outcome.value}
            data-outcome={outcome.value}
            className="text-console-13 text-text-secondary"
          >
            <span className="font-medium text-text-primary">{outcome.label}</span>
            {outcome.story === undefined ? null : `: ${outcome.story}`}
          </li>
        ))}
      </ul>
    </section>
  );
}
