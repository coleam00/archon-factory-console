import type { ReactNode } from 'react';
import { errorDetail } from '../../lib/http';
import type { MapGraph } from '../lib/map-graph';
import type { FactoryViewListed } from '../lib/views';

/**
 * What the map says under it about the pack graph read: that it failed (the map then draws
 * only the declared arrows), that some of the pack's workflows failed to load, and every start
 * of a workflow that has no card here, so a hand-off the map cannot draw is still named.
 */
export function MapGraphNotes({
  view,
  graph,
  error,
}: {
  view: FactoryViewListed['declaration'];
  graph: MapGraph | undefined;
  error: unknown;
}): ReactNode {
  if (graph === undefined)
    return error === undefined ? null : (
      <p role="alert" className="text-console-12 text-error">
        The hand-offs between workflows could not be read, so the map shows only the declared ones:{' '}
        {errorDetail(error)}
      </p>
    );
  const label = (stage: string): string =>
    view.stages.find(entry => entry.id === stage)?.label ?? stage;
  const failed = graph.failedToLoad;
  return (
    <>
      {failed === 0 ? null : (
        <p role="alert" className="text-console-12 text-warning">
          {failed === 1
            ? "1 of the pack's workflows failed to load, so the map may miss its hand-offs."
            : `${failed.toString()} of the pack's workflows failed to load, so the map may miss their hand-offs.`}
        </p>
      )}
      {graph.offMap.length === 0 ? null : (
        <ul aria-label="Starts not on the map" className="flex flex-col gap-0.5">
          {graph.offMap.map(start => (
            <li
              key={`${start.from}:${start.when}:${start.starts}`}
              className="text-console-12 text-text-secondary"
            >
              When <span className="font-mono">{start.workflow}</span> ends{' '}
              <span className="font-mono">{start.when}</span> in {label(start.from)}, it also starts{' '}
              <span className="font-mono">{start.starts}</span>, which has no card here.
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
