import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router';
import { errorDetail } from '../../lib/http';
import * as skill from '../../skills';
import type { FactoryOverviewRead } from '../../skills/factory';
import { K } from '../../store/keys';
import { useFactoryRead } from '../useFactoryRead';
import { FactoryFrame } from '../FactoryFrame';
import { FactoryLoading } from '../FactoryLoading';
import { readFailed } from '../lib/deadline';
import { openView, viewList, viewTrail, type OverviewDeclaration } from '../lib/overview-nav';
import { OverviewBreadcrumb } from './OverviewBreadcrumb';
import { OverviewLegend } from './OverviewLegend';
import { OverviewMap } from './OverviewMap';
import { OverviewSidebar } from './OverviewSidebar';

/**
 * `/console/p/:projectId/factory/how-it-works`: the hand-written explainer of how the factory runs,
 * for presenting it. The open view is `?view=<id>`, so the browser's back goes up a level.
 */
export function OverviewPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="how-it-works" wide>
      {() => <OverviewRead projectId={projectId} />}
    </FactoryFrame>
  );
}

function OverviewRead({ projectId }: { projectId: string }): ReactNode {
  // The frame reads the same key for its sub-navigation, so this is one fetch.
  const read = useFactoryRead<FactoryOverviewRead>(K.factoryOverview(projectId), within =>
    within(signal => skill.getFactoryOverview({ codebaseId: projectId }, { signal }))
  );
  const failed = readFailed(read.error);
  if (failed !== undefined)
    return (
      <p role="alert" className="text-sm text-error">
        The factory overview could not be loaded: {errorDetail(failed)}
      </p>
    );
  if (read.data === undefined) return <FactoryLoading read={read} />;
  // A broken file is listed by the frame above; with none at all, say so here.
  if (read.data.overview === null)
    return read.data.errors.length > 0 ? null : (
      <p className="text-sm text-text-secondary">This factory's pack has no overview file.</p>
    );
  return <OverviewBody overview={read.data.overview.declaration} />;
}

/** The overview: on the page, or full screen over the whole console until Esc or Exit. */
export function OverviewBody({ overview }: { overview: OverviewDeclaration }): ReactElement {
  const [params, setParams] = useSearchParams();
  const [fullScreen, setFullScreen] = useState(false);
  const { id: viewId, unknown } = openView(overview, params.get('view'));
  const open = (id: string): void => {
    setParams(id === overview.root ? {} : { view: id });
  };

  useEffect(() => {
    if (!fullScreen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFullScreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullScreen]);

  const explorer = (
    <OverviewExplorer
      overview={overview}
      viewId={viewId}
      unknown={unknown}
      fullScreen={fullScreen}
      onOpen={open}
      onToggleFullScreen={() => setFullScreen(!fullScreen)}
    />
  );
  if (!fullScreen) return explorer;
  // Portalled to the body, so no ancestor's layout or transform can hold the overlay in.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${overview.title}, full screen`}
      className="fixed inset-0 z-50 flex flex-col bg-background p-4"
    >
      {explorer}
    </div>,
    document.body
  );
}

function OverviewExplorer({
  overview,
  viewId,
  unknown,
  fullScreen,
  onOpen,
  onToggleFullScreen,
}: {
  overview: OverviewDeclaration;
  viewId: string;
  unknown: string | undefined;
  fullScreen: boolean;
  onOpen: (view: string) => void;
  onToggleFullScreen: () => void;
}): ReactElement {
  const view = overview.views[viewId];
  const trail = viewTrail(overview, viewId);
  const parent = trail.at(-2);
  // Full screen the map takes the height; the presenter says what the caption says.
  const caption = fullScreen
    ? undefined
    : viewId === overview.root
      ? overview.caption
      : view?.caption;
  return (
    <div className={`flex flex-col gap-4 md:flex-row ${fullScreen ? 'min-h-0 flex-1' : ''}`}>
      <OverviewSidebar views={viewList(overview)} current={viewId} onOpen={onOpen} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <OverviewBreadcrumb trail={trail} onOpen={onOpen} />
        {unknown === undefined ? null : (
          <p className="text-console-12 text-text-tertiary">
            This overview has no view "{unknown}", so it opened at the top.
          </p>
        )}
        {view === undefined ? null : (
          <OverviewMap
            // A new view opens fitted, whatever the last one's camera did.
            key={viewId}
            view={view}
            fullScreen={fullScreen}
            onOpen={onOpen}
            onUp={parent === undefined ? undefined : () => onOpen(parent.id)}
            onToggleFullScreen={onToggleFullScreen}
          />
        )}
        <OverviewLegend overview={overview} />
        {/* Under the map, so the whole root view is in the first screen at 1440x900. */}
        {caption === undefined ? null : (
          <p className="max-w-4xl text-sm leading-relaxed text-text-secondary">{caption}</p>
        )}
      </div>
    </div>
  );
}
