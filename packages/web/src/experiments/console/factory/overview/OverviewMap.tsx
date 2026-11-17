import { useMemo, type ReactElement } from 'react';
import { MIN_ZOOM } from '../lib/map-camera';
import { layoutOverview, OVERVIEW_PAGE_MAX_H } from '../lib/overview-layout';
import type { OverviewView } from '../lib/overview-nav';
import { useMapCamera } from '../map/useMapCamera';
import { OverviewCard } from './OverviewCard';
import { OverviewEdges } from './OverviewEdges';

interface OverviewMapProps {
  view: OverviewView;
  /** Full screen the frame fills the space it is given; on the page it is as tall as the fitted view. */
  fullScreen: boolean;
  onOpen: (view: string) => void;
  /** Up one level; undefined at the root. */
  onUp: (() => void) | undefined;
  /** Enters full screen, or leaves it when in it. */
  onToggleFullScreen: () => void;
}

/**
 * One view of the overview on a pannable, zoomable canvas: its groups as dashed boxes, its
 * edges, then its cards. It opens fitted; the page keys it by view, so every view opens fitted.
 * The fit may go under the live map's readable floor: the overview's layout test holds its
 * titles to 14 px fitted instead.
 */
export function OverviewMap({
  view,
  fullScreen,
  onOpen,
  onUp,
  onToggleFullScreen,
}: OverviewMapProps): ReactElement {
  const { cards, groups, edges, bounds } = useMemo(() => layoutOverview(view), [view]);
  const camera = useMapCamera(bounds, null, MIN_ZOOM);
  const { k, x, y } = camera.camera;
  return (
    <div className={`flex flex-col gap-2 ${fullScreen ? 'min-h-0 flex-1' : ''}`}>
      <div
        ref={camera.frameRef}
        style={fullScreen ? undefined : { height: Math.min(camera.height, OVERVIEW_PAGE_MAX_H) }}
        aria-label="How the factory works. Drag to move, scroll to zoom, click a card marked ⤢ to open it."
        role="group"
        className={`relative min-w-0 cursor-grab touch-none select-none overflow-hidden rounded-console-12 border border-border bg-surface-inset active:cursor-grabbing ${
          fullScreen ? 'min-h-0 flex-1' : ''
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
            if (box === undefined) return null;
            return (
              <div
                key={group.id}
                data-group={group.id}
                className="absolute rounded-console-16 border-2 border-dashed border-border-bright"
                style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
              >
                <span className="absolute -top-3 left-5 whitespace-nowrap bg-surface-inset px-2 text-console-18 font-medium uppercase leading-none tracking-wider text-text-tertiary">
                  {group.label}
                </span>
              </div>
            );
          })}
          <OverviewEdges edges={edges} bounds={bounds} />
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
  return (
    // Under the frame, not over it: over it, they would cover the lane and its label.
    <div className="flex items-center gap-0.5 self-end rounded-console-12 border border-border bg-surface px-1 py-0.5">
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
