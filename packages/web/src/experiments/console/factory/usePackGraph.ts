import { useMemo } from 'react';
import { requestJson } from '../lib/http';
import { useEntity, type EntityView } from '../store/cache';
import { mapArrows, type MapArrow, type PackGraph, type RunNames } from './lib/graph-structure';
import type { FactoryViewListed } from './lib/views';
import { useReadRetry, type ReadRetry } from './useReadRetry';

/** The cache key of a project's pack graph read. */
export const packGraphKey = (projectId: string, packKey: string): string =>
  `factory-pack-graph:${projectId}:${packKey}`;

/**
 * The pack graph (`GET /api/packs/{pack}/graph`), the one source of the factory's structure: a
 * stage's steps and the map's arrows. `packKey` is the views listing's `packKey`, the pack's
 * folder key, not `owner/name`.
 *
 * Read through the Console's cache and nothing else: no server cache. Not through
 * `useFactoryRead`, whose deadline is at most 30 s per attempt: a cold graph read can take over a
 * minute, so under that deadline it would never land. The key is outside the prefixes the
 * dashboard stream invalidates, since a run moving on does not change the pack; it is read again
 * when the page loads afresh. Only the map and the stage modal read it: the board and the item
 * page never wait on it.
 */
export function usePackGraph(projectId: string, packKey: string): EntityView<PackGraph> {
  return useEntity(packGraphKey(projectId, packKey), () =>
    requestJson('/api/packs/{pack}/graph', 'get', {
      params: { pack: packKey },
      query: { codebaseId: projectId },
    })
  );
}

/**
 * The graph read, what the view's workflows are called in it, and the map's arrows once read.
 * `failed` and `retry` are the read's own (`useReadRetry`), held by the map that mounts with
 * the page, so the stage modal, which mounts later, shows a failure rather than dismissing it.
 */
export interface MapStructure extends ReadRetry {
  graph: EntityView<PackGraph>;
  runNames: RunNames;
  /** Undefined until the graph is read. */
  arrows: MapArrow[] | undefined;
}

/** The structure the map and its stage modal draw: the view's pack graph, projected onto its stages. */
export function useMapStructure(projectId: string, listed: FactoryViewListed): MapStructure {
  const graph = usePackGraph(projectId, listed.packKey);
  const { declaration, runNames } = listed;
  const arrows = useMemo(
    () => (graph.data === undefined ? undefined : mapArrows(declaration, graph.data, runNames)),
    [graph.data, declaration, runNames]
  );
  return { graph, runNames, arrows, ...useReadRetry(graph) };
}
