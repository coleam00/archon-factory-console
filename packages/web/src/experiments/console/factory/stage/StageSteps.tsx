import { useMemo, type ReactElement } from 'react';
import type { FactoryItem } from '../../skills/factory';
import type { EntityView } from '../../store/cache';
import { FactoryLoading } from '../FactoryLoading';
import { GraphSkeleton } from '../GraphSkeleton';
import { stageSteps } from '../lib/graph-structure';
import { itemsOnStep, runningItems } from '../lib/items-on-step';
import { readFailure } from '../lib/read-failure';
import type { FactoryStage } from '../lib/stage-steps';
import { engineIdTitle, stepLabel } from '../lib/step-label';
import type { FactoryViewListed } from '../lib/views';
import { ReadFailure } from '../ReadFailure';
import { RunningItemLinks } from '../RunningItems';
import type { MapStructure } from '../usePackGraph';

type Declaration = FactoryViewListed['declaration'];

/**
 * The real steps of each workflow the stage lists and the pack runs now, from the pack graph,
 * as a plain list: a step is text, with no page of its own. A step an item is on now is marked
 * and names it. While the graph is read the list is a skeleton; a failed read says why with a
 * Retry.
 */
export function StageSteps({
  projectId,
  view,
  stage,
  structure,
  items,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  structure: MapStructure;
  items: EntityView<FactoryItem[]>;
}): ReactElement {
  const { graph, runNames, failed, retry } = structure;
  if (graph.data === undefined)
    return failed !== undefined ? (
      <ReadFailure retry={retry}>
        Could not read the pack's steps: {readFailure(failed)}
      </ReadFailure>
    ) : (
      <FactoryLoading read={graph}>
        <GraphSkeleton label="Loading the steps" />
      </FactoryLoading>
    );
  return (
    <>
      {stageSteps(view, stage, graph.data, runNames).map(({ workflow, steps }) => (
        <WorkflowSteps
          key={workflow}
          projectId={projectId}
          view={view}
          workflow={workflow}
          steps={steps}
          items={items}
        />
      ))}
    </>
  );
}

/** One workflow: who runs it now, then its steps in the graph's order. */
function WorkflowSteps({
  projectId,
  view,
  workflow,
  steps,
  items,
}: {
  projectId: string;
  view: Declaration;
  workflow: string;
  steps: string[] | undefined;
  items: EntityView<FactoryItem[]>;
}): ReactElement {
  // A failed refresh keeps the last list in the cache; it is no longer evidence of what runs.
  const onStep = useMemo(
    () => (items.error === undefined ? itemsOnStep(items.data ?? [], workflow) : undefined),
    [items.data, items.error, workflow]
  );
  return (
    <section className="flex flex-col gap-2 [contain:inline-size]">
      <h4 className="font-mono text-console-15 font-semibold text-text-primary">{workflow}</h4>
      <RunningNow projectId={projectId} view={view} workflow={workflow} items={items} />
      {steps === undefined ? (
        <p className="text-console-13 text-text-tertiary">
          The pack graph has no workflow <span className="font-mono">{workflow}</span>.
        </p>
      ) : (
        <ol aria-label={`The steps of ${workflow}`} className="flex flex-col gap-1">
          {steps.map((step, index) => {
            const here = onStep?.get(step) ?? [];
            const name = stepLabel(view, workflow, step);
            return (
              <li
                key={step}
                data-step={step}
                data-running={here.length > 0 ? 'true' : undefined}
                title={engineIdTitle(name, step)}
                className="flex flex-wrap items-baseline gap-x-2 text-console-14 text-text-secondary"
              >
                <span className="w-6 shrink-0 text-right tabular-nums text-text-tertiary">
                  {index + 1}.
                </span>
                <span className={here.length > 0 ? 'font-medium text-text-primary' : undefined}>
                  {name}
                </span>
                {here.length > 0 ? (
                  <RunningItemLinks view={view} projectId={projectId} items={here} />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The items a run of this workflow works now, named and linked. */
function RunningNow({
  projectId,
  view,
  workflow,
  items,
}: {
  projectId: string;
  view: Declaration;
  workflow: string;
  items: EntityView<FactoryItem[]>;
}): ReactElement | null {
  const onWorkflow = useMemo(
    () => runningItems(items.data ?? [], workflow),
    [items.data, workflow]
  );
  // A failed or slow refresh leaves the last list no evidence of what runs; the stage view says
  // so above the tabs, with a Retry.
  if (items.error !== undefined || onWorkflow.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h5 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        Running now
      </h5>
      <RunningItemLinks view={view} projectId={projectId} items={onWorkflow} />
    </div>
  );
}
