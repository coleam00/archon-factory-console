import type { ReactElement } from 'react';
import { useParams } from 'react-router';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { readFailed } from './lib/deadline';
import { stageReadOf } from './lib/map-live';
import type { FactoryStage } from './lib/stage-steps';
import { factoryPath, type FactoryViewListed } from './lib/views';
import { StageView, useStageTab } from './stage/StageView';
import { useStageLive } from './stage/useStageLive';
import { useFactoryItems } from './useFactoryItems';

/**
 * `/console/p/:projectId/factory/stages/:stage`: one stage, full page, as a deep link. The
 * Overview opens the same `StageView` as a modal over its map (`?stage=<id>`).
 */
export function StagePage(): ReactElement {
  const { projectId = '', stage: stageId = '' } = useParams<{
    projectId: string;
    stage: string;
  }>();
  return (
    <FactoryFrame section={null}>
      {(view, attention) => {
        const stage = view.declaration.stages.find(candidate => candidate.id === stageId);
        return (
          <div className="flex flex-col gap-6">
            <BackLink to={factoryPath(projectId)} label="Back to the overview" />
            {stage === undefined ? (
              <p className="text-console-14 text-text-secondary">
                This factory has no stage <span className="font-mono">{stageId}</span>.
              </p>
            ) : (
              <LiveStage
                key={stage.id}
                projectId={projectId}
                view={view.declaration}
                stage={stage}
                attention={attention}
              />
            )}
          </div>
        );
      }}
    </FactoryFrame>
  );
}

/** The stage over its live items, read here as the map reads them for its chips. Keyed by stage. */
function LiveStage({
  projectId,
  view,
  stage,
  attention,
}: {
  projectId: string;
  view: FactoryViewListed['declaration'];
  stage: FactoryStage;
  attention: EntityView<AttentionQueue>;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const live = useStageLive(
    view,
    items.data,
    readFailed(items.error) === undefined ? 'loading' : 'failed',
    attention.data?.items
  );
  const [tab, setTab] = useStageTab(stage);
  return (
    <StageView
      projectId={projectId}
      view={view}
      stage={stage}
      live={stageReadOf(live, stage.id)}
      tab={tab}
      onTab={setTab}
    />
  );
}
