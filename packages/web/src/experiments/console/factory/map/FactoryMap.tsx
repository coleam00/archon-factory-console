import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { errorDetail } from '../../lib/http';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import type { FactoryItem } from '../../skills/factory';
import { useFactoryItems } from '../useFactoryItems';
import { rowsFor } from '../lib/map-camera';
import { layoutMap } from '../lib/map-layout';
import { stageLive, type MapLive } from '../lib/map-live';
import { factoryPath, type FactoryViewListed } from '../lib/views';
import { MapArrows } from './MapArrows';
import { MapCard } from './MapCard';
import { MapDetails } from './MapDetails';
import { MapLegend } from './MapLegend';
import { MapNotOnMap } from './MapNotOnMap';
import { useMapCamera } from './useMapCamera';
import { useRowWidth } from './useRowWidth';

interface FactoryMapProps {
  projectId: string;
  view: FactoryViewListed;
  attention: EntityView<AttentionQueue>;
}

/** What the map draws from: the declaration and the attention queue. */
interface MapInputs {
  projectId: string;
  view: FactoryViewListed['declaration'];
  attention: EntityView<AttentionQueue>;
}

/**
 * The Overview's map: the stages and arrows the view file declares, and live chips from the
 * items read.
 */
export function FactoryMap({ projectId, view, attention }: FactoryMapProps): ReactElement {
  const items = useFactoryItems(projectId);
  return (
    <section aria-label="The map" className="flex flex-col gap-2.5">
      <h3 className="text-console-11 font-medium uppercase tracking-wider text-text-tertiary">
        The map
      </h3>
      <MapBody projectId={projectId} view={view.declaration} items={items} attention={attention} />
    </section>
  );
}

function MapBody({
  items,
  ...inputs
}: MapInputs & { items: EntityView<FactoryItem[]> }): ReactNode {
  if (items.data === undefined) {
    if (items.error !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          The factory's items could not be loaded: {errorDetail(items.error)}
        </p>
      );
    return <p className="text-xs text-text-tertiary">Loading…</p>;
  }
  return <MapLiveCanvas {...inputs} items={items.data} />;
}

/**
 * The map over loaded items. It keeps where each item sat on the last read, as the board
 * does, so a run on a step no stage names holds its card where the board holds its column.
 */
function MapLiveCanvas({
  items,
  attention,
  ...inputs
}: MapInputs & { items: FactoryItem[] }): ReactElement {
  const { view } = inputs;
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const queue = attention.data?.items;
  const live = useMemo(
    () => stageLive(view, items, queue ?? [], previous.current),
    [view, items, queue]
  );
  useEffect(() => {
    previous.current = live.positions;
  }, [live]);
  return <MapCanvas {...inputs} live={live} />;
}

function MapCanvas({
  projectId,
  view,
  live,
}: Omit<MapInputs, 'attention'> & { live: MapLive }): ReactElement {
  // The row holding the frame and the details panel, so opening the panel does not re-wrap.
  const row = useRowWidth();
  const oneRow = useMemo(() => layoutMap(view, 1), [view]);
  const rows = rowsFor(oneRow.bounds, row.width);
  const layout = useMemo(() => (rows === 1 ? oneRow : layoutMap(view, 2)), [rows, oneRow, view]);
  const { boxes, bounds } = layout;
  const [selected, setSelected] = useState<string | null>(null);
  const camera = useMapCamera(bounds, selected === null ? null : (boxes.get(selected) ?? null));
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

  const stageNotes = (stage: string): string[] =>
    (view.map.notes ?? []).filter(note => note.near === stage).map(note => note.text);
  const selectedStage = view.stages.find(stage => stage.id === selected);
  const { k, x, y } = camera.camera;
  return (
    <div className="flex flex-col gap-2">
      {/* Side by side from md up; on a phone the details stack under the map. */}
      <div ref={row.ref} className="flex flex-col gap-3 md:flex-row">
        <div
          ref={camera.frameRef}
          style={{ height: camera.height }}
          aria-label="Factory map. Drag to move, scroll to zoom, click a stage to open it; its details button shows what is in it."
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
            <MapArrows layout={layout} />
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
                  onDetails={stage => setSelected(current => (current === stage ? null : stage))}
                />
              );
            })}
          </div>
          <MapControls zoomIn={camera.zoomIn} zoomOut={camera.zoomOut} fit={camera.fit} />
        </div>
        {selectedStage === undefined ? null : (
          <MapDetails
            projectId={projectId}
            view={view}
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
