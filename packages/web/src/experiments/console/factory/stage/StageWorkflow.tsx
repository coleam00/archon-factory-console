import { useMemo, useRef, useState, type ReactElement } from 'react';
import { SkeletonGroup, SkeletonLine } from '../../components/Skeleton';
import * as skill from '../../skills';
import type { FactoryItem, FactoryWorkflow } from '../../skills/factory';
import type { EntityView } from '../../store/cache';
import { K } from '../../store/keys';
import { FactoryLoading } from '../FactoryLoading';
import { GraphSkeleton } from '../GraphSkeleton';
import { readFailed } from '../lib/deadline';
import { itemsOnStep, runningItems } from '../lib/items-on-step';
import { retryOnceOnNetworkFailure } from '../lib/network-retry';
import { readFailure } from '../lib/read-failure';
import { stepInStage, type FactoryStage } from '../lib/stage-steps';
import { stepGraph } from '../lib/step-graph';
import { stepLabel } from '../lib/step-label';
import type { FactoryViewListed } from '../lib/views';
import { RunningItemLinks, RunningItemsFailure } from '../RunningItems';
import { StepGraph } from '../StepGraph';
import { useFactoryRead } from '../useFactoryRead';

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
  const read = useFactoryRead<FactoryWorkflow>(K.factoryWorkflow(projectId, workflow), within =>
    retryOnceOnNetworkFailure(() =>
      within(signal => skill.getFactoryWorkflow({ codebaseId: projectId, workflow }, { signal }))
    )
  );
  const failed = useShownFailure(read);
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
      ) : failed.error !== undefined ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 text-console-14 text-error [overflow-wrap:anywhere]">
            Could not read the workflow <span className="font-mono">{workflow}</span>:{' '}
            {readFailure(failed.error)}
          </p>
          <button
            type="button"
            onClick={failed.retry}
            className="rounded-md border border-border bg-surface px-2.5 py-1 text-console-13 text-text-primary transition-colors duration-150 ease-out hover:bg-surface-hover"
          >
            Retry
          </button>
        </div>
      ) : (
        <FactoryLoading read={read}>
          <GraphSkeleton label="Loading the steps" />
        </FactoryLoading>
      )}
    </section>
  );
}

/**
 * The failure to show for `read`, and a retry. The cache keeps a read's error after its last
 * reader leaves, and a reader that comes back loads again with that error still held, so the
 * error held when this reader mounted, or when Retry was pressed, is dismissed: only a failure
 * of a load this reader waited on shows. (`loading` cannot tell them apart: it still reads true
 * on the render that brings the error.)
 */
function useShownFailure(read: EntityView<unknown>): {
  error: Error | undefined;
  retry: () => void;
} {
  const dismissed = useRef(read.error);
  const [, rerender] = useState(0);
  const failed = readFailed(read.error);
  return {
    error: failed === dismissed.current ? undefined : failed,
    retry: (): void => {
      dismissed.current = read.error;
      rerender(count => count + 1);
      read.refetch();
    },
  };
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
