import { useMemo, useState, type ReactElement } from 'react';
import { GitMerge } from 'lucide-react';
import { useParams } from 'react-router';
import { EmptyNote } from '../components/EmptyNote';
import { SegmentedControl } from '../components/SegmentedControl';
import { SkeletonGroup, SkeletonLine } from '../components/Skeleton';
import * as skill from '../skills';
import type { FactoryWorkflow } from '../skills/factory';
import type { EntityView } from '../store/cache';
import { K } from '../store/keys';
import { useFactoryRead } from './useFactoryRead';
import { readFailed } from './lib/deadline';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { RunningItemLinks, RunningItemsFailure } from './RunningItems';
import { StageDrilldown } from './stage/StageDrilldown';
import { StepGraph } from './StepGraph';
import { useFactoryItems } from './useFactoryItems';
import type { FactoryItem } from '../skills/factory';
import { itemsOnStep, runningItems } from './lib/items-on-step';
import { stepInStage, type FactoryStage } from './lib/stage-steps';
import { stepGraph } from './lib/step-graph';
import { stepLabel } from './lib/step-label';
import { readFailure } from './lib/read-failure';
import { factoryPath, type FactoryViewListed } from './lib/views';
import { FactoryLoading } from './FactoryLoading';
import { GraphSkeleton } from './GraphSkeleton';

type Declaration = FactoryViewListed['declaration'];

/**
 * `/console/p/:projectId/factory/stages/:stage`: what a stage does, told as its drill-down when
 * the view gives one, and each workflow's steps.
 */
export function StagePage(): ReactElement {
  const { projectId = '', stage: stageId = '' } = useParams<{
    projectId: string;
    stage: string;
  }>();
  return (
    <FactoryFrame section={null}>
      {view => {
        const stage = view.declaration.stages.find(candidate => candidate.id === stageId);
        return (
          <div className="flex flex-col gap-6">
            <BackLink to={factoryPath(projectId)} label="Back to the overview" />
            {stage === undefined ? (
              <p className="text-console-14 text-text-secondary">
                This factory has no stage <span className="font-mono">{stageId}</span>.
              </p>
            ) : (
              // Keyed by stage, so a card picked or graph shown on one stage is not on the next.
              <StageBody
                key={stage.id}
                projectId={projectId}
                view={view.declaration}
                stage={stage}
              />
            )}
          </div>
        );
      }}
    </FactoryFrame>
  );
}

function StageBody({
  projectId,
  view,
  stage,
}: {
  projectId: string;
  view: Declaration;
  stage: FactoryStage;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const [real, setReal] = useState(false);
  const header = (
    <div className="flex flex-col gap-2">
      <h3 className="text-console-17 font-semibold text-text-primary">{stage.label}</h3>
      <p className="max-w-3xl text-console-14 leading-relaxed text-text-secondary">{stage.blurb}</p>
    </div>
  );
  const graphs = stage.workflows.map(workflow => (
    <StageWorkflow
      key={workflow}
      projectId={projectId}
      view={view}
      stage={stage}
      workflow={workflow}
      items={items}
    />
  ));
  return (
    <>
      {stage.drilldown !== undefined ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            {header}
            <SegmentedControl
              label="How this stage is drawn"
              active={real ? 'real' : 'drilldown'}
              segments={[
                { key: 'drilldown', label: 'Drill-down', onSelect: () => setReal(false) },
                { key: 'real', label: 'Real steps', onSelect: () => setReal(true) },
              ]}
            />
          </div>
          {real ? (
            graphs
          ) : (
            <StageDrilldown
              projectId={projectId}
              view={view}
              stage={stage}
              drilldown={stage.drilldown}
              items={items}
            />
          )}
        </>
      ) : stage.workflows.length === 0 ? (
        <>
          {header}
          <EmptyNote
            icon={GitMerge}
            sentence="No workflow runs in this stage. An item arrives here when its change merges."
          />
        </>
      ) : (
        <>
          {header}
          {graphs}
        </>
      )}
    </>
  );
}

function StageWorkflow({
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
    within(signal => skill.getFactoryWorkflow({ codebaseId: projectId, workflow }, { signal }))
  );
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
  const stepsFailed = readFailed(read.error);
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
      ) : stepsFailed !== undefined ? (
        <p className="font-mono text-console-13 text-error">
          Could not load the steps: {readFailure(stepsFailed)}
        </p>
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
