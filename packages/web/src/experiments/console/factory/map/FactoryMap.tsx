import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { errorDetail } from '../../lib/http';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import type { FactoryItem } from '../../skills/factory';
import { useFactoryItems } from '../useFactoryItems';
import { arrowPaths, cardBoxes, mapBounds } from '../lib/map-layout';
import { stageLive, type MapLive } from '../lib/map-live';
import { factoryPath, type FactoryViewListed } from '../lib/views';
import { MapArrows } from './MapArrows';
import { MapCard } from './MapCard';
import { MapDetails } from './MapDetails';
import { MapLegend } from './MapLegend';
import { MapNotOnMap } from './MapNotOnMap';
import { useMapCamera } from './useMapCamera';

/** How far (px) a double-click's second click may land from its first: Windows' default is 4. */
const DOUBLE_CLICK_SLOP = 4;

interface FactoryMapProps {
  projectId: string;
  view: FactoryViewListed['declaration'];
  attention: EntityView<AttentionQueue>;
}

/** The Overview's map: the declared stages and hand-offs, with live chips from the items read. */
export function FactoryMap({ projectId, view, attention }: FactoryMapProps): ReactElement {
  const items = useFactoryItems(projectId);
  return (
    <section aria-label="The map" className="flex flex-col gap-2.5">
      <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        The map
      </h3>
      <MapBody projectId={projectId} view={view} items={items} attention={attention} />
    </section>
  );
}

function MapBody({
  projectId,
  view,
  items,
  attention,
}: FactoryMapProps & { items: EntityView<FactoryItem[]> }): ReactNode {
  if (items.data === undefined) {
    if (items.error !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          The factory's items could not be loaded: {errorDetail(items.error)}
        </p>
      );
    return <p className="text-xs text-text-tertiary">Loading…</p>;
  }
  const live = stageLive(view, items.data, attention.data?.items ?? []);
  return <MapCanvas projectId={projectId} view={view} live={live} />;
}

function MapCanvas({
  projectId,
  view,
  live,
}: {
  projectId: string;
  view: FactoryViewListed['declaration'];
  live: MapLive;
}): ReactElement {
  const navigate = useNavigate();
  const { boxes, arrows, bounds } = useMemo(() => {
    const placed = cardBoxes(view.map);
    const drawn = arrowPaths(view.map, placed);
    return { boxes: placed, arrows: drawn, bounds: mapBounds(placed, drawn) };
  }, [view.map]);
  const [selected, setSelected] = useState<string | null>(null);
  const camera = useMapCamera(bounds, selected === null ? null : (boxes.get(selected) ?? null));
  /** Where the last single click on a card was, and which card: a double-click opens it. */
  const firstClick = useRef<{ stage: string; x: number; y: number } | null>(null);
  const stagePath = (stage: string): string =>
    factoryPath(projectId, `/stages/${encodeURIComponent(stage)}`);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const select = (stage: string, event: MouseEvent): void => {
    if (event.detail === 1) firstClick.current = { stage, x: event.clientX, y: event.clientY };
    setSelected(stage);
  };
  /**
   * The first click opens the details panel at once, which narrows the frame and moves the
   * map, so the second click of a slow double-click can land on another card or in the panel.
   * The row catches it first. A second click at the first click's point (a person's
   * double-click: the pointer did not move, the map did) opens the first click's card. Any
   * other second click, such as a synthesised double-click elsewhere, which sends only the
   * second click, opens the card under it.
   */
  const onRowClickCapture = (event: MouseEvent): void => {
    const first = firstClick.current;
    if (event.detail < 2) {
      firstClick.current = null;
      return;
    }
    firstClick.current = null;
    const samePoint =
      first !== null &&
      Math.abs(event.clientX - first.x) <= DOUBLE_CLICK_SLOP &&
      Math.abs(event.clientY - first.y) <= DOUBLE_CLICK_SLOP;
    const under = (event.target as Partial<Element>).closest?.('[data-stage]');
    const stage = samePoint ? first.stage : (under?.getAttribute('data-stage') ?? null);
    if (stage === null) return;
    event.preventDefault();
    event.stopPropagation();
    void navigate(stagePath(stage));
  };

  const stageNotes = (stage: string): string[] =>
    (view.map.notes ?? []).filter(note => note.near === stage).map(note => note.text);
  const selectedStage = view.stages.find(stage => stage.id === selected);
  const { k, x, y } = camera.camera;
  return (
    <div className="flex flex-col gap-2">
      {/* Side by side from md up; on a phone the details stack under the map. */}
      <div className="flex flex-col gap-3 md:flex-row" onClickCapture={onRowClickCapture}>
        <div
          ref={camera.frameRef}
          style={{ height: camera.height }}
          aria-label="Factory map. Drag to move, scroll to zoom, click a stage for details, double-click to open it."
          role="group"
          className="relative min-w-0 cursor-grab md:flex-1 touch-none select-none overflow-hidden rounded-console-12 border border-border bg-surface-inset active:cursor-grabbing"
          {...camera.frameHandlers}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${x.toString()}px, ${y.toString()}px) scale(${k.toString()})`,
              transformOrigin: '0 0',
            }}
          >
            <MapArrows arrows={arrows} bounds={bounds} />
            {view.stages.map(stage => {
              const box = boxes.get(stage.id);
              const stageLiveEntry = live.stages.get(stage.id);
              if (box === undefined || stageLiveEntry === undefined) return null;
              return (
                <MapCard
                  key={stage.id}
                  stage={stage}
                  box={box}
                  live={stageLiveEntry}
                  notes={stageNotes(stage.id)}
                  selected={stage.id === selected}
                  openTo={stagePath(stage.id)}
                  onSelect={select}
                />
              );
            })}
          </div>
          <MapControls zoomIn={camera.zoomIn} zoomOut={camera.zoomOut} fit={camera.fit} />
        </div>
        {selectedStage === undefined ? null : (
          <MapDetails
            projectId={projectId}
            stage={selectedStage}
            live={live.stages.get(selectedStage.id) ?? { items: [], working: 0, needYou: [] }}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
      <MapLegend stages={view.stages} />
      <MapNotOnMap projectId={projectId} view={view} entries={live.notOnMap} />
    </div>
  );
}

const CONTROL =
  'rounded px-2 py-0.5 text-console-12 text-text-secondary hover:bg-surface-hover hover:text-text-primary';

function MapControls({
  zoomIn,
  zoomOut,
  fit,
}: {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}): ReactElement {
  return (
    <div
      // A press on the controls must not start a pan of the map under them.
      onPointerDown={event => event.stopPropagation()}
      className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-console-12 border border-border bg-surface px-1 py-0.5"
    >
      <button type="button" aria-label="Zoom out" onClick={zoomOut} className={CONTROL}>
        −
      </button>
      <button type="button" onClick={fit} className={CONTROL}>
        Fit
      </button>
      <button type="button" aria-label="Zoom in" onClick={zoomIn} className={CONTROL}>
        +
      </button>
    </div>
  );
}
