import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { standingRun } from '../../routes/BoardPage';
import type { ItemRead } from '../../skills/items';
import type { CuratedView } from '../lib/curated-view';
import { itemStateLine, type StateTone } from '../lib/item-state';
import type { StageRead } from '../lib/map-live';
import { runLogPath } from '../lib/views';
import { SkeletonGroup, SkeletonLine } from '../ui/Skeleton';

const HEADING = 'text-console-12 font-medium uppercase tracking-console-label text-text-tertiary';

/** A state line's colour, from the Visual standard's state colours. */
const TONE: Record<StateTone, string> = {
  'needs-you': 'text-warning',
  running: 'text-[color:var(--running)]',
  failed: 'text-error',
  merged: 'text-success',
  quiet: 'text-text-tertiary',
};

/** An item's key, linked to the run log of the run it stands at (the console has no item page). */
export function ItemLink({ projectId, read }: { projectId: string; read: ItemRead }): ReactElement {
  const run = standingRun(read);
  const key = <span className="font-mono text-console-12">{read.item.key}</span>;
  return run === undefined ? (
    key
  ) : (
    <Link
      to={runLogPath(projectId, run.id)}
      className="text-text-primary hover:underline"
      title={read.item.title ?? undefined}
    >
      {key}
    </Link>
  );
}

/**
 * What sits on a map stage now, each item linking to its run log: the map's details panel and
 * the stage's "Items here now" both draw it from the one `StageRead` the map's chips draw from,
 * so the two never disagree. Skeleton lines until the items are read (rule 6), never `empty`
 * early, and "Could not be read." once the first read failed. Where the stage counts more than
 * it lists (the landed stage lists only the newest done items), it points at the board.
 */
export function ItemsHere({
  projectId,
  view,
  live,
  board,
  empty,
}: {
  projectId: string;
  /** The view file's words for stages and outcomes. */
  view: Pick<CuratedView, 'stageLabels' | 'outcomeLabels'>;
  live: StageRead;
  /** The project's board, which lists every item. */
  board: string;
  /** What it says when nothing is in the stage. */
  empty: ReactNode;
}): ReactElement {
  if (typeof live === 'string')
    return (
      <section className="flex flex-col gap-1.5">
        <h6 className={HEADING}>Items here</h6>
        {live === 'loading' ? (
          <SkeletonGroup label="Loading the items here" className="flex flex-col gap-2">
            <SkeletonLine />
            <SkeletonLine width="short" />
          </SkeletonGroup>
        ) : (
          <p className="text-console-13 text-text-tertiary">Could not be read.</p>
        )}
      </section>
    );
  const unlisted = live.total - live.items.length;
  return (
    <section data-items-here className="flex flex-col gap-1.5">
      <h6 className={HEADING}>Items here · {live.total}</h6>
      {live.total === 0 ? (
        empty
      ) : (
        <ul className="flex flex-col gap-1">
          {live.items.map(read => (
            <ItemRow key={read.item.id} projectId={projectId} view={view} read={read} />
          ))}
        </ul>
      )}
      {unlisted <= 0 ? null : (
        <Link to={board} className="text-console-12 text-accent-bright hover:underline">
          {unlisted} more, on the board
        </Link>
      )}
    </section>
  );
}

/** One item: its key and title, then where it stands, in plain words (`itemStateLine`). */
function ItemRow({
  projectId,
  view,
  read,
}: {
  projectId: string;
  view: Pick<CuratedView, 'stageLabels' | 'outcomeLabels'>;
  read: ItemRead;
}): ReactElement {
  const run = standingRun(read);
  const state = itemStateLine(view, read);
  const body = (
    <>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span
          className={`shrink-0 font-mono text-console-12 ${read.item.title == null ? 'text-text-primary' : 'text-text-tertiary'}`}
        >
          {read.item.key}
        </span>
        {read.item.title == null ? null : (
          <span className="min-w-0 truncate text-console-12 text-text-primary">
            {read.item.title}
          </span>
        )}
      </span>
      <span data-state={state.tone} className={`text-console-12 ${TONE[state.tone]}`}>
        {state.text}
      </span>
    </>
  );
  const row = 'flex min-w-0 flex-col rounded px-1.5 py-1';
  return (
    <li data-item={read.item.key}>
      {run === undefined ? (
        <div className={row}>{body}</div>
      ) : (
        <Link to={runLogPath(projectId, run.id)} className={`${row} hover:bg-surface-hover`}>
          {body}
        </Link>
      )}
    </li>
  );
}
