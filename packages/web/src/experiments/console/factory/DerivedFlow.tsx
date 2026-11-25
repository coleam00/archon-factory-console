/**
 * The map derived from the pack graph (DESIGN.md, COMBINED direction): the pack's columns, its
 * document groups then each flow stage no group holds, as a row of boxes with their counts,
 * then the board's Done. The Overview draws it when the pack ships no curated view file, and
 * as the curated map's "Full workflow".
 */
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import {
  chipOf,
  columnsOf,
  MOVING,
  newestDone,
  standingRun,
  type StageGroup,
} from '../routes/BoardPage';
import { listItems, type ItemPage, type ItemRead } from '../skills/items';
import { useEntity } from '../store/cache';
import { K } from '../store/keys';
import { usePackGraph } from './map-structure';

/** How many of a pack's items sit in each column, and how many of those wait on the operator. */
export function flowCounts(
  columns: readonly StageGroup[],
  items: readonly ItemRead[]
): { name: string; stages: string[]; count: number; needYou: number }[] {
  return columns.map(column => {
    const here = items.filter(read =>
      column.stages.includes(standingRun(read)?.pack?.workflow ?? '')
    );
    return {
      ...column,
      count: here.length,
      needYou: here.filter(read => chipOf(read) === 'needs_you').length,
    };
  });
}

/** The pack's columns as a row of boxes with their counts, then the board's Done. */
export function DerivedFlow({
  board,
  flow,
  done,
  landed,
}: {
  board: string;
  flow: ReturnType<typeof flowCounts>;
  done: number;
  /** How many merged today; the How it works page, which reads no day, leaves it out. */
  landed?: number;
}): ReactElement {
  return (
    <div data-flow>
      <h2 className="text-sm font-medium text-text-primary">The flow</h2>
      <ol className="mt-3 flex flex-col gap-2 md:flex-row md:flex-wrap md:items-stretch">
        {flow.map(column => (
          <li key={column.name} className="flex items-center gap-2">
            <Link
              data-flow-group={column.name}
              to={`${board}?group=${encodeURIComponent(column.name)}`}
              className="block min-w-36 rounded-console-12 border border-border px-4 py-3 hover:border-border-bright"
            >
              <span className="text-console-12 font-medium text-text-secondary">{column.name}</span>
              <span data-count className="ml-2 text-base tabular-nums text-text-primary">
                {column.count}
              </span>
              <span className="mt-1 block font-mono text-console-10 text-text-tertiary">
                {column.stages.join(' · ')}
              </span>
              {column.needYou > 0 ? (
                <span data-need-you className="mt-1 block text-console-11 text-warning">
                  {column.needYou} need you
                </span>
              ) : null}
            </Link>
            <span aria-hidden className="text-text-tertiary">
              →
            </span>
          </li>
        ))}
        <li>
          <Link
            data-flow-group="done"
            to={board}
            className="block min-w-36 rounded-console-12 border border-border px-4 py-3 hover:border-border-bright"
          >
            <span className="text-console-12 font-medium text-text-secondary">Done</span>
            <span data-count className="ml-2 text-base tabular-nums text-text-primary">
              {done}
            </span>
            {landed === undefined ? null : (
              <span className="mt-1 block text-console-11 text-text-tertiary">
                {landed} landed today
              </span>
            )}
          </Link>
        </li>
      </ol>
    </div>
  );
}

/**
 * The derived map of a pack as a project stages it, read on its own, under the keys the board
 * and the Overview read with: How it works draws it outside any project's page.
 */
export function DerivedMap({ projectId, pack }: { projectId: string; pack: string }): ReactElement {
  const graph = usePackGraph(projectId, pack);
  const open = useEntity<ItemRead[]>(K.board(projectId), () => listItems(projectId, MOVING));
  const done = useEntity<ItemPage>(K.boardDone(projectId, pack), () => newestDone(projectId, pack));
  const moving = (open.data ?? []).filter(read => read.standing.pack === pack);
  return (
    <DerivedFlow
      board={`/console/p/${encodeURIComponent(projectId)}/board`}
      flow={flowCounts(columnsOf(graph.data), moving)}
      done={done.data?.totals?.done ?? 0}
    />
  );
}
