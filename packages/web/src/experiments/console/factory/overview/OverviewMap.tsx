import { useMemo, type ReactElement } from 'react';
import type { Box } from '../lib/map-layout';
import {
  groupLabelBox,
  layoutOverview,
  OVERVIEW_FIT_PAD,
  OVERVIEW_FULL_FIT_PAD,
  OVERVIEW_MAX_K,
  OVERVIEW_MIN_K,
  OVERVIEW_PAGE_MAX_H,
  OVERVIEW_SMALL_TEXT,
} from '../lib/overview-layout';
import type { OverviewView } from '../lib/overview-nav';
import { useMapCamera } from '../map/useMapCamera';
import { OverviewCard } from './OverviewCard';
import { OverviewEdges } from './OverviewEdges';

interface OverviewMapProps {
  view: OverviewView;
  /** Full screen the frame fills the screen; on the page it is as tall as the fitted view. */
  fullScreen: boolean;
  onOpen: (view: string) => void;
  /** Up one level; undefined at the root. */
  onUp: (() => void) | undefined;
  /** Enters full screen, or leaves it when in it. */
  onToggleFullScreen: () => void;
}

/**
 * One view of the overview on a pannable, zoomable canvas: its groups as dashed boxes, its
 * edges and fans, then its cards. It opens fitted, never under the zoom at which its smallest
 * text draws at the type floor: a view wider than its frame there opens at its start and pans.
 * The page keys it by view, so every view opens fitted. Full screen, the breadcrumb, these
 * controls and the legend float over the frame's corners, so the fit keeps a wider margin.
 */
export function OverviewMap({
  view,
  fullScreen,
  onOpen,
  onUp,
  onToggleFullScreen,
}: OverviewMapProps): ReactElement {
  const { cards, groups, edges, bounds, fans } = useMemo(() => layoutOverview(view), [view]);
  const pad = fullScreen ? OVERVIEW_FULL_FIT_PAD : OVERVIEW_FIT_PAD;
  const camera = useMapCamera(bounds, null, { pad, minK: OVERVIEW_MIN_K, maxK: OVERVIEW_MAX_K });
  const { k, x, y } = camera.camera;
  return (
    <div className={fullScreen ? 'absolute inset-0' : 'flex flex-col gap-2'}>
      <div
        ref={camera.frameRef}
        style={fullScreen ? undefined : { height: Math.min(camera.height, OVERVIEW_PAGE_MAX_H) }}
        aria-label="How the factory works. Drag to move, scroll to zoom, click a card marked ⤢ to open it."
        role="group"
        className={`relative min-w-0 cursor-grab touch-none select-none overflow-hidden bg-surface-inset active:cursor-grabbing ${
          fullScreen ? 'size-full' : 'rounded-console-12 border border-border'
        }`}
        {...camera.frameHandlers}
      >
        <div
          className="absolute left-0 top-0"
          style={{
            transform: `translate(${x.toString()}px, ${y.toString()}px) scale(${k.toString()})`,
            transformOrigin: '0 0',
          }}
        >
          {(view.groups ?? []).map(group => {
            const box = groups.get(group.id);
            return box === undefined ? null : (
              <OverviewGroup key={group.id} id={group.id} label={group.label} box={box} />
            );
          })}
          <OverviewEdges edges={edges} fans={fans} bounds={bounds} />
          {view.cards.map(card => {
            const box = cards.get(card.id);
            if (box === undefined) return null;
            return <OverviewCard key={card.id} card={card} box={box} onOpen={onOpen} />;
          })}
        </div>
      </div>
      <OverviewControls
        camera={camera}
        onUp={onUp}
        fullScreen={fullScreen}
        onToggleFullScreen={onToggleFullScreen}
      />
    </div>
  );
}

/** A group's dashed box, its label on the top border where `groupLabelBox` puts it. */
function OverviewGroup({ id, label, box }: { id: string; label: string; box: Box }): ReactElement {
  const at = groupLabelBox(box, label);
  return (
    <>
      <div
        data-group={id}
        className="absolute rounded-console-16 border border-dashed border-border-bright"
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      />
      <span
        className={`absolute flex items-center whitespace-nowrap bg-surface-inset px-2 ${OVERVIEW_SMALL_TEXT} font-medium uppercase tracking-console-label text-text-tertiary`}
        style={{ left: at.x, top: at.y, height: at.h }}
      >
        {label}
      </span>
    </>
  );
}

const CONTROL =
  'rounded px-2 py-0.5 text-console-12 text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-40 disabled:hover:bg-transparent';

function OverviewControls({
  camera,
  onUp,
  fullScreen,
  onToggleFullScreen,
}: {
  camera: ReturnType<typeof useMapCamera>;
  onUp: (() => void) | undefined;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
}): ReactElement {
  // On the page, under the frame, so they never cover a line or a label; full screen, they
  // float in the top-right corner, which the fit's wider margin keeps clear.
  const place = fullScreen ? 'absolute right-4 top-4 shadow-lg' : 'self-end';
  return (
    <div
      className={`flex items-center gap-0.5 rounded-console-12 border border-border bg-surface px-1 py-0.5 ${place}`}
    >
      <button type="button" disabled={onUp === undefined} onClick={onUp} className={CONTROL}>
        ↑ Up one level
      </button>
      <button type="button" aria-label="Zoom out" onClick={camera.zoomOut} className={CONTROL}>
        −
      </button>
      <button type="button" onClick={camera.fit} className={CONTROL}>
        Fit
      </button>
      <button type="button" aria-label="Zoom in" onClick={camera.zoomIn} className={CONTROL}>
        +
      </button>
      <button type="button" onClick={onToggleFullScreen} className={CONTROL}>
        {fullScreen ? 'Exit full screen (Esc)' : '⛶ Full screen'}
      </button>
    </div>
  );
}
