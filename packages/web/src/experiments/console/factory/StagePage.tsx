import { useMemo, type ReactElement } from 'react';
import { useParams } from 'react-router';
import * as skill from '../skills';
import type { FactoryWorkflow } from '../skills/factory';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { StepGraph } from './StepGraph';
import { stepInStage, type FactoryStage } from './lib/stage-steps';
import { stepGraph } from './lib/step-graph';
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
          <StageWorkflow key={workflow} projectId={projectId} stage={stage} workflow={workflow} />
        ))
      )}
    </>
  );
}

function StageWorkflow({
  projectId,
  stage,
  workflow,
}: {
  projectId: string;
  stage: FactoryStage;
  workflow: string;
}): ReactElement {
  const read = useEntity<FactoryWorkflow>(K.factoryWorkflow(projectId, workflow), () =>
    skill.getFactoryWorkflow({ codebaseId: projectId, workflow })
  );
  const graph = useMemo(
    () =>
      read.data === undefined ? undefined : stepGraph(read.data, key => stepInStage(stage, key)),
    [read.data, stage]
  );
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-mono text-console-13 font-semibold text-text-primary">{workflow}</h4>
      {stage.nodes === undefined ? null : (
        <p className="text-console-12 text-text-tertiary">
          Other stages work the dimmed steps of this workflow.
        </p>
      )}
      {graph !== undefined ? (
        <StepGraph projectId={projectId} workflow={workflow} stageId={stage.id} graph={graph} />
      ) : read.error !== undefined ? (
        <p className="font-mono text-console-12 text-error">
          Could not load the steps: {read.error.message}
        </p>
      ) : (
        <p className="text-console-12 text-text-tertiary">Loading the steps…</p>
      )}
    </section>
  );
}
