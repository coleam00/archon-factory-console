import { useMemo, type ReactElement } from 'react';
import { SkeletonGroup, SkeletonLine } from '../../components/Skeleton';
import type { FactoryItem } from '../../skills/factory';
import type { EntityView } from '../../store/cache';
import { FactoryLoading } from '../FactoryLoading';
import { GraphSkeleton } from '../GraphSkeleton';
import { readFailed } from '../lib/deadline';
import { itemsOnStep, runningItems } from '../lib/items-on-step';
import { stepInStage, type FactoryStage } from '../lib/stage-steps';
import { stepGraph } from '../lib/step-graph';
import { stepLabel } from '../lib/step-label';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks, RunningItemsFailure } from '../RunningItems';
import { StepGraph } from '../StepGraph';
import { useFactoryWorkflow, WorkflowReadFailure } from './useFactoryWorkflow';

type Declaration = FactoryViewListed['declaration'];

/**
 * One workflow of a stage, drawn from the pack's workflow file: who runs it now, then its step
 * graph. The read never dead-ends: a network failure is tried once more, and a failure says
 * what failed with a Retry button, while what is already drawn stays drawn.
 */
export function StageWorkflow({
  projectId,
  view,
  stage,
  workflow,
  items,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
  workflow: string;
  items: EntityView<FactoryItem[]>;
}): ReactElement {
  const { read, failed, retry } = useFactoryWorkflow(projectId, workflow);
  const graph = useMemo(
    () =>
      read.data === undefined
        ? undefined
        : stepGraph(
            read.data,
            key => stepInStage(stage, key),
            key => stepLabel(view, workflow, key)
          ),
    [read.data, stage, view, workflow]
  );
  // A failed refresh keeps the last list in the cache; it is no longer evidence of what runs.
  const running = useMemo(
    () => (items.error === undefined ? itemsOnStep(items.data ?? [], workflow) : undefined),
    [items.data, items.error, workflow]
  );
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-console-15 font-semibold text-text-primary">{workflow}</h4>
      {stage.nodes === undefined ? null : (
        <p className="text-console-13 text-text-tertiary">
          Other stages work the dimmed steps of this workflow.
        </p>
      )}
      <RunningNow projectId={projectId} view={view} workflow={workflow} items={items} />
      {graph !== undefined ? (
        <StepGraph
          projectId={projectId}
          workflow={workflow}
          stageId={stage.id}
          graph={graph}
          running={running}
        />
      ) : failed !== undefined ? (
        <WorkflowReadFailure workflow={workflow} error={failed} retry={retry} />
      ) : (
        <FactoryLoading read={read}>
          <GraphSkeleton label="Loading the steps" />
        </FactoryLoading>
      )}
    </section>
  );
}

/** The items a run of this workflow works now, named and linked: a graph node is a button. */
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
  const failed = readFailed(items.error);
  if (failed !== undefined) return <RunningItemsFailure error={failed} />;
  // A slow refresh, like a failed one, leaves the last list no evidence: retry and say so.
  if (items.error !== undefined)
    return (
      <FactoryLoading read={items}>
        <SkeletonGroup label="Reading which items run here">
          <SkeletonLine width="short" />
        </SkeletonGroup>
      </FactoryLoading>
    );
  if (onWorkflow.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h5 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        Running now
      </h5>
      <RunningItemLinks view={view} projectId={projectId} items={onWorkflow} />
    </div>
  );
}
