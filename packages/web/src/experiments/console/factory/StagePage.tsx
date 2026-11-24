import type { ReactElement } from 'react';
import { FileQuestionMark } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { EmptyNote } from '../components/EmptyNote';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { BackLink } from './BackLink';
import { FactoryFrame } from './FactoryFrame';
import { WAY_ON_LINK } from './FactoryNotFound';
import { readFailed } from './lib/deadline';
import { stageReadOf } from './lib/map-live';
import type { FactoryStage } from './lib/stage-steps';
import { factoryPath, stageModalLink, type FactoryViewListed } from './lib/views';
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
              <StageNotFound
                projectId={projectId}
                stageId={stageId}
                stages={view.declaration.stages}
              />
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

/** A stage id the view does not declare: the Overview, and each stage it does, as the ways on. */
function StageNotFound({
  projectId,
  stageId,
  stages,
}: {
  projectId: string;
  stageId: string;
  stages: FactoryStage[];
}): ReactElement {
  return (
    <EmptyNote
      icon={FileQuestionMark}
      sentence={
        <>
          There is no stage <span className="font-mono">{stageId}</span> in this factory.
        </>
      }
      link={
        <nav aria-label="Stages" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link to={factoryPath(projectId)} className={WAY_ON_LINK}>
            Open the Overview
          </Link>
          {stages.map(stage => (
            <Link
              key={stage.id}
              to={stageModalLink(projectId, stage.id).to}
              className={WAY_ON_LINK}
            >
              {stage.label}
            </Link>
          ))}
        </nav>
      }
    />
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
    projectId,
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
