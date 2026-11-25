/**
 * A pack's map on the project Overview: the curated map when the pack ships a view file the
 * server read without an error, else the map derived from the pack graph (`mapSource`, the one
 * place that chooses). The curated map offers the derived one as "Full workflow"
 * (`?map=full`). The routes import the factory's map through this file only.
 */
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { columnsOf } from '../routes/BoardPage';
import type { ItemRead, PackGraph } from '../skills/items';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import { getPackViewRead, type FactoryView, type PackView } from './api';
import { DerivedFlow, flowCounts } from './DerivedFlow';
import { GraphSkeleton } from './GraphSkeleton';
import { curatedView } from './lib/curated-view';
import { mapSource } from './lib/map-source';
import { stageLive, type DoneRead, type MapLive, type Unread } from './lib/map-live';
import { CuratedMap } from './map/CuratedMap';
import { useMapStructure, usePackGraph } from './map-structure';
import { ReadFailure } from './ReadFailure';
import { SegmentedControl } from './ui/SegmentedControl';

/** The search param that shows the derived map in place of the curated one. */
const MAP_PARAM = 'map';
const FULL = 'full';

/** The view read of a pack, under its one cache key. */
export function usePackView(projectId: string, pack: string): EntityView<PackView> {
  return useEntity(K.packView(projectId, pack), () => getPackViewRead(projectId, pack));
}

interface PackMapProps {
  projectId: string;
  pack: string;
  /** The pack's items on a stage, as the board reads them; undefined until read. */
  moving: { data?: ItemRead[]; error?: Error };
  /** The board's Done: its count and the newest done items. */
  done: DoneRead;
  /** How many changes merged today, for the derived map's Done box. */
  landedToday: number;
}

const HEADING = 'text-console-12 font-medium uppercase tracking-console-label text-text-tertiary';

export function PackMap({
  projectId,
  pack,
  moving,
  done,
  landedToday,
}: PackMapProps): ReactElement {
  const source = mapSource(usePackView(projectId, pack));
  const graph = usePackGraph(projectId, pack);
  const [params, setParams] = useSearchParams();
  const board = `/console/p/${encodeURIComponent(projectId)}/board`;
  const derived = (
    <DerivedFlow
      board={board}
      flow={flowCounts(columnsOf(graph.data), moving.data ?? [])}
      done={done.total}
      landed={landedToday}
    />
  );
  if (source.kind === 'loading')
    return (
      <MapSection>
        <GraphSkeleton label="Loading the map" />
      </MapSection>
    );
  // Without a curated file the Overview draws the derived map as it always has, under its own
  // heading, with the reason a broken file is not drawn above it.
  if (source.kind === 'derived')
    return (
      <div data-pack-map className="flex flex-col gap-2.5">
        {source.note === null ? null : (
          <p data-map-note className="text-console-12 text-warning">
            {source.note}
          </p>
        )}
        {derived}
      </div>
    );
  const full = params.get(MAP_PARAM) === FULL;
  const choose = (next: boolean) => (): void =>
    setParams(current => {
      const kept = new URLSearchParams(current);
      if (next) kept.set(MAP_PARAM, FULL);
      else kept.delete(MAP_PARAM);
      return kept;
    });
  return (
    <MapSection
      control={
        <SegmentedControl
          label="Which map"
          active={full ? 'full' : 'map'}
          segments={[
            { key: 'map', label: 'Map', onSelect: choose(false) },
            { key: 'full', label: 'Full workflow', onSelect: choose(true) },
          ]}
        />
      }
    >
      {full ? (
        derived
      ) : (
        <Curated
          projectId={projectId}
          file={source.view}
          graph={graph}
          moving={moving}
          done={done}
          board={board}
        />
      )}
    </MapSection>
  );
}

function MapSection({
  control,
  children,
}: {
  control?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <section aria-label="The map" data-pack-map className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <h3 className={HEADING}>The map</h3>
        {control}
      </div>
      {children}
    </section>
  );
}

/** The curated map, once the graph its columns and arrows come from is read. */
function Curated({
  projectId,
  file,
  graph,
  moving,
  done,
  board,
}: {
  projectId: string;
  file: FactoryView;
  graph: EntityView<PackGraph>;
  moving: PackMapProps['moving'];
  done: DoneRead;
  board: string;
}): ReactElement {
  const view = useMemo(
    () => (graph.data === undefined ? undefined : curatedView(file, graph.data)),
    [file, graph.data]
  );
  const structure = useMapStructure(graph, view);
  const live: MapLive | Unread = useMemo(() => {
    if (view === undefined || moving.data === undefined)
      return moving.error === undefined ? 'loading' : 'failed';
    return stageLive(view, moving.data, done);
  }, [view, moving.data, moving.error, done]);
  if (view === undefined)
    return graph.error === undefined ? (
      <GraphSkeleton label="Loading the map" />
    ) : (
      <ReadFailure retry={graph.refetch}>
        The map could not read the pack's graph: {graph.error.message}
      </ReadFailure>
    );
  return (
    <>
      {moving.error === undefined ? null : (
        <p role="alert" className="text-console-13 text-error">
          The pack's items could not be read: {moving.error.message}
        </p>
      )}
      <CuratedMap
        projectId={projectId}
        view={view}
        structure={structure}
        live={live}
        board={board}
      />
    </>
  );
}
