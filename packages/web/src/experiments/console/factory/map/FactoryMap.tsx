import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { errorDetail } from '../../lib/http';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import type { FactoryItem } from '../../skills/factory';
import { StaleRead } from '../StaleRead';
import { useFactoryItems } from '../useFactoryItems';
import { rowsFor } from '../lib/map-camera';
import { layoutMap } from '../lib/map-layout';
import { EMPTY_STAGE_LIVE, stageLive, type MapLive, type StageLive } from '../lib/map-live';
import { factoryPath, type FactoryViewListed } from '../lib/views';
import { MapArrows } from './MapArrows';
import { MapCard } from './MapCard';
import { MapDetails } from './MapDetails';
import { MapLegend } from './MapLegend';
import { MapNotOnMap } from './MapNotOnMap';
import { useMapCamera } from './useMapCamera';
import { useRowWidth } from './useRowWidth';
import { FactoryLoading } from '../FactoryLoading';
import { readFailed, SlowReadError } from '../lib/deadline';

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
}: MapInputs & { items: EntityView<FactoryItem[]> }): ReactElement {
  // One shape in every state: a notice above one canvas, so the items answering fills the
  // chips in on the cards already drawn rather than mounting a new map.
  return (
    <>
      <ItemsNotice items={items} />
      <MapLiveCanvas {...inputs} items={items.data} />
    </>
  );
}

/**
 * What the map says above itself about the items read. Before the first answer the cards say
 * "…" themselves, so there is no page-level "Loading…"; a read past its deadline says so.
 */
function ItemsNotice({ items }: { items: EntityView<FactoryItem[]> }): ReactElement | null {
  if (items.data !== undefined) return <StaleRead error={items.error} />;
  const failed = readFailed(items.error);
  if (failed !== undefined)
    return (
      <p role="alert" className="text-sm text-error">
        The factory's items could not be loaded: {errorDetail(failed)}
      </p>
    );
  return items.error instanceof SlowReadError ? <FactoryLoading read={items} /> : null;
}

/**
 * The map over the items, drawn from the declaration before they are read (`items` undefined:
 * every card says "…"). It keeps where each item sat on the last read, as the board does, so a
 * run on a step no stage names holds its card where the board holds its column.
 */
function MapLiveCanvas({
  items,
  attention,
  ...inputs
}: MapInputs & { items: FactoryItem[] | undefined }): ReactElement {
  const { view } = inputs;
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const queue = attention.data?.items;
  const live = useMemo(
    () => (items === undefined ? null : stageLive(view, items, queue ?? [], previous.current)),
    [view, items, queue]
  );
  useEffect(() => {
    if (live !== null) previous.current = live.positions;
  }, [live]);
  return <MapCanvas {...inputs} live={live} />;
}

/** One stage's chips: null while the items are not read yet, empty when nothing sits there. */
const liveOf = (live: MapLive | null, stage: string): StageLive | null =>
  live === null ? null : (live.stages.get(stage) ?? EMPTY_STAGE_LIVE);

function MapCanvas({
  projectId,
  view,
  live,
}: Omit<MapInputs, 'attention'> & { live: MapLive | null }): ReactElement {
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
              if (box === undefined) return null;
              return (
                <MapCard
                  key={stage.id}
                  stage={stage}
                  box={box}
                  live={liveOf(live, stage.id)}
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
            live={liveOf(live, selectedStage.id)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
      <MapLegend stages={view.stages} />
      <MapNotOnMap projectId={projectId} view={view} entries={live?.notOnMap ?? []} />
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
