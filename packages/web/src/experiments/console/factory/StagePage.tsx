import { useMemo, type ReactElement } from 'react';
import { useParams } from 'react-router';
import * as skill from '../skills';
import type { FactoryWorkflow } from '../skills/factory';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { RunningItemLinks, RunningItemsFailure } from './RunningItems';
import { StepGraph } from './StepGraph';
import { useFactoryItems } from './useFactoryItems';
import { itemsOnStep, runningItems, type FactoryItem } from './lib/items-on-step';
import { stepInStage, type FactoryStage } from './lib/stage-steps';
import { stepGraph } from './lib/step-graph';
import { readFailure } from './lib/read-failure';
import { factoryPath } from './lib/views';

/** `/console/p/:projectId/factory/stages/:stage`: what a stage does, and each workflow's steps. */
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
          <div className="flex flex-col gap-5">
            <BackLink to={factoryPath(projectId)} label="Back to the overview" />
            {stage === undefined ? (
              <p className="text-sm text-text-secondary">
                This factory has no stage <span className="font-mono">{stageId}</span>.
              </p>
            ) : (
              <StageBody projectId={projectId} stage={stage} />
            )}
          </div>
        );
      }}
    </FactoryFrame>
  );
}

function StageBody({ projectId, stage }: { projectId: string; stage: FactoryStage }): ReactElement {
  const items = useFactoryItems(projectId);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-medium text-text-primary">{stage.label}</h3>
        <p className="max-w-3xl text-sm leading-relaxed text-text-secondary">{stage.blurb}</p>
      </div>
      {stage.workflows.length === 0 ? (
        <p className="text-sm text-text-secondary">
          No workflow runs in this stage. An item arrives here when its change merges.
        </p>
      ) : (
        stage.workflows.map(workflow => (
          <StageWorkflow
            key={workflow}
            projectId={projectId}
            stage={stage}
            workflow={workflow}
            items={items}
          />
        ))
      )}
    </>
  );
}

function StageWorkflow({
  projectId,
  stage,
  workflow,
  items,
}: {
  projectId: string;
  stage: FactoryStage;
  workflow: string;
  items: EntityView<FactoryItem[]>;
}): ReactElement {
  const read = useEntity<FactoryWorkflow>(K.factoryWorkflow(projectId, workflow), () =>
    skill.getFactoryWorkflow({ codebaseId: projectId, workflow })
  );
  const graph = useMemo(
    () =>
      read.data === undefined ? undefined : stepGraph(read.data, key => stepInStage(stage, key)),
    [read.data, stage]
  );
  // A failed refresh keeps the last list in the cache; it is no longer evidence of what runs.
  const running = useMemo(
    () => (items.error === undefined ? itemsOnStep(items.data ?? [], workflow) : undefined),
    [items.data, items.error, workflow]
  );
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-console-13 font-semibold text-text-primary">{workflow}</h4>
      {stage.nodes === undefined ? null : (
        <p className="text-console-12 text-text-tertiary">
          Other stages work the dimmed steps of this workflow.
        </p>
      )}
      <RunningNow projectId={projectId} workflow={workflow} items={items} />
      {graph !== undefined ? (
        <StepGraph
          projectId={projectId}
          workflow={workflow}
          stageId={stage.id}
          graph={graph}
          running={running}
        />
      ) : read.error !== undefined ? (
        <p className="font-mono text-console-12 text-error">
          Could not load the steps: {readFailure(read.error)}
        </p>
      ) : (
        <p className="text-console-12 text-text-tertiary">Loading the steps…</p>
      )}
    </section>
  );
}

/** The items a run of this workflow works now, named and linked: a graph node is a button. */
function RunningNow({
  projectId,
  workflow,
  items,
}: {
  projectId: string;
  workflow: string;
  items: EntityView<FactoryItem[]>;
}): ReactElement | null {
  const onWorkflow = useMemo(
    () => runningItems(items.data ?? [], workflow),
    [items.data, workflow]
  );
  if (items.error !== undefined) return <RunningItemsFailure error={items.error} />;
  if (onWorkflow.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h5 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        Running now
      </h5>
      <RunningItemLinks projectId={projectId} items={onWorkflow} />
    </div>
  );
}
