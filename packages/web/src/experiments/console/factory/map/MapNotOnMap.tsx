import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import type { Declaration } from '../lib/board';
import type { NotOnMap } from '../lib/map-live';
import { factoryPath } from '../lib/views';

/**
 * Items no card shows, each with why, so the cards never undercount silently and the reader
 * can tell whether the fix is in the declaration or in the items read.
 */
export function MapNotOnMap({
  projectId,
  view,
  entries,
}: {
  projectId: string;
  view: Declaration;
  entries: readonly NotOnMap[];
}): ReactNode {
  if (entries.length === 0) return null;
  return (
    <section aria-label="Not on the map" className="flex flex-col gap-1">
      <p className="text-console-12 font-medium text-warning">
        {entries.length === 1
          ? '1 item is not on the map'
          : `${entries.length.toString()} items are not on the map`}
      </p>
      <ul className="flex flex-col gap-0.5">
        {entries.map(entry => (
          <li key={entry.item.item.id} className="text-console-12 text-text-secondary">
            <Link
              to={factoryPath(projectId, `/items/${encodeURIComponent(entry.item.item.key)}`)}
              className="font-mono text-console-11 text-text-primary underline"
            >
              {entry.item.item.key}
            </Link>{' '}
            <Why view={view} why={entry.why} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Why({ view, why }: { view: Declaration; why: NotOnMap['why'] }): ReactElement {
  const mono = (text: string): ReactElement => (
    <span className="font-mono text-console-11">{text}</span>
  );
  if (why.kind === 'no-card') {
    const label = view.stages.find(stage => stage.id === why.stage)?.label ?? why.stage;
    return (
      <>
        is in {label} ({mono(why.stage)}), which has no card in the view's map.cards.
      </>
    );
  }
  if (why.reason === 'no-stage')
    return <>runs {mono(why.workflow)}, which no stage of the factory view lists.</>;
  return <>has no progress: the server could not derive where it stands.</>;
}
