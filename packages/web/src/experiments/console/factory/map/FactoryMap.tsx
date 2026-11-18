import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { errorDetail } from '../../lib/http';
import type { AttentionQueue } from '../../skills/runs';
import type { EntityView } from '../../store/cache';
import type { FactoryItem } from '../../skills/factory';
import { StaleRead } from '../StaleRead';
import { useFactoryItems } from '../useFactoryItems';
import { busiestCard, layoutMap } from '../lib/map-layout';
import {
  EMPTY_STAGE_LIVE,
  stageLive,
  type MapLive,
  type StageRead,
  type Unread,
} from '../lib/map-live';
import type { FactoryStage } from '../lib/stage-steps';
import { factoryPath, type FactoryViewListed } from '../lib/views';
import { MapArrows } from './MapArrows';
import { stageShadowLines, stageShadows } from '../lib/shadows';
import { MapCard } from './MapCard';
import { MapDetails } from './MapDetails';
import { MapFlow } from './MapFlow';
import { MapLegend } from './MapLegend';
import { MapNotOnMap } from './MapNotOnMap';
import { useMapCamera } from './useMapCamera';
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
      <h3 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
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
      <MapLiveCanvas
        {...inputs}
        items={items.data}
        unread={readFailed(items.error) === undefined ? 'loading' : 'failed'}
      />
    </>
  );
}

/**
 * What the map says above itself about the items read. Before the first answer the cards show
 * skeleton chips themselves, so there is no page-level "Loading…"; a read past its deadline says so.
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
 * every chip a skeleton bar, or none once the read failed). It keeps where each item sat on the last
 * read, as the board does, so a run on a step no stage names holds its card where the board
 * holds its column.
 */
function MapLiveCanvas({
  items,
  unread,
  attention,
  ...inputs
}: MapInputs & { items: FactoryItem[] | undefined; unread: Unread }): ReactElement {
  const { view } = inputs;
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const queue = attention.data?.items;
  const live = useMemo(
    () => (items === undefined ? unread : stageLive(view, items, queue ?? [], previous.current)),
    [view, items, queue, unread]
  );
  useEffect(() => {
    if (typeof live !== 'string') previous.current = live.positions;
  }, [live]);
  return <MapCanvas {...inputs} live={live} items={items ?? NO_ITEMS} />;
}

/** One stage's chips, why there are none yet, or empty when nothing sits there. */
const liveOf = (live: MapLive | Unread, stage: string): StageRead =>
  typeof live === 'string' ? live : (live.stages.get(stage) ?? EMPTY_STAGE_LIVE);

const NO_ITEMS: readonly FactoryItem[] = [];

function MapCanvas({
  projectId,
  view,
  live,
  items,
}: Omit<MapInputs, 'attention'> & {
  live: MapLive | Unread;
  /** Every item read, for what each shadow step decided lately; empty before the first read. */
  items: readonly FactoryItem[];
}): ReactElement {
  const layout = useMemo(() => layoutMap(view), [view]);
  const { cards, bounds } = layout;
  const [selected, setSelected] = useState<string | null>(null);
  const selectedCard = cards.find(card => card.id === selected);
  // By id, so the opening box keeps its identity until the busiest card changes. A stage whose
  // count waits on a merge answer counts as empty: its chip says "checking…", not a number, and
  // opening on it would move the map again once the answer lands.
  const busiest =
    typeof live === 'string'
      ? undefined
      : busiestCard(
          cards,
          stage => {
            const here = live.stages.get(stage);
            return here === undefined || here.pending ? 0 : here.items.length;
          },
          view.landed.stage
        )?.id;
  const open = useMemo(
    () => cards.find(card => card.id === busiest)?.box ?? null,
    [cards, busiest]
  );
  const camera = useMapCamera(bounds, selectedCard?.box ?? null, undefined, open);
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

  const stagesOf = (stages: readonly string[]): FactoryStage[] =>
    stages.flatMap(id => view.stages.filter(stage => stage.id === id));
  const stageNotes = (stage: string): string[] =>
    (view.map.notes ?? []).filter(note => note.near === stage).map(note => note.text);
  const { k, x, y } = camera.camera;
  return (
    <div className="flex flex-col gap-2">
      {/* Side by side from md up; on a phone the details stack under the map. */}
      <div className="flex flex-col gap-3 md:flex-row">
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
            {cards.map(card => (
              <MapCard
                key={card.id}
                card={card}
                stages={stagesOf(card.stages)}
                shadows={stage => stageShadowLines(stage, view, items)}
                live={stage => liveOf(live, stage)}
                selected={card.id === selected}
                stagePath={stagePath}
                onDetails={id => setSelected(current => (current === id ? null : id))}
              />
            ))}
            <MapFlow
              cards={cards}
              arrows={layout.arrows}
              working={card =>
                typeof live !== 'string' &&
                card.stages.some(stage => (live.stages.get(stage)?.working ?? 0) > 0)
              }
            />
          </div>
          <MapControls zoomIn={camera.zoomIn} zoomOut={camera.zoomOut} fit={camera.fit} />
        </div>
        {selectedCard === undefined ? null : (
          <MapDetails
            projectId={projectId}
            view={view}
            title={selectedCard.label}
            stages={stagesOf(selectedCard.stages).map(stage => ({
              stage,
              live: liveOf(live, stage.id),
              notes: stageNotes(stage.id),
              shadows: stageShadowLines(stage, view, items),
            }))}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
      <MapLegend
        tones={cards.map(card => card.tone)}
        shadow={view.stages.some(stage => stageShadows(stage, view).length > 0)}
      />
      <MapNotOnMap
        projectId={projectId}
        view={view}
        entries={typeof live === 'string' ? [] : live.notOnMap}
      />
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
