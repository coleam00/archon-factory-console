import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { MergeState, PillBadge, RoundDots } from './BoardCard';
import type { BoardCard, BoardModel } from './lib/board';
import { itemPath } from './lib/board';
import { engineIdTitle } from './lib/step-label';
import { statusTextClass } from '../lib/run-status';
import { shortDateTime } from './lib/board-table';
import { RowAnswer, RowAsk } from './BoardAskFace';
import type { BoardAsks } from './useBoardAsks';
import {
  sortRows,
  TABLE_COLUMNS,
  tableRows,
  type TableColumnId,
  type TableRow,
  type TableSort,
} from './lib/board-table';

/** Table view: one row per item with the card's fields as columns; a header click sorts. */
export function BoardTable({
  projectId,
  model,
  moved,
  asks,
}: {
  projectId: string;
  model: BoardModel;
  moved: ReadonlySet<string>;
  asks: BoardAsks;
}): ReactElement {
  const [sort, setSort] = useState<TableSort>({ by: 'column', descending: false });
  const rows = sortRows(tableRows(model), sort);
  const sortBy = (by: TableColumnId): void => {
    setSort(current => ({ by, descending: current.by === by ? !current.descending : false }));
  };
  return (
    <div className="overflow-x-auto md:min-h-0 md:flex-1 md:overflow-y-auto">
      <table className="w-full text-left text-console-13">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border text-console-12 uppercase tracking-wider text-text-tertiary">
            {TABLE_COLUMNS.map(column => (
              <th
                key={column.id}
                scope="col"
                aria-sort={
                  sort.by === column.id ? (sort.descending ? 'descending' : 'ascending') : undefined
                }
                className="px-1.5 py-1.5 align-bottom font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    sortBy(column.id);
                  }}
                  className="text-left uppercase tracking-wider hover:text-text-primary"
                >
                  {column.label}
                  {/* A no-break space keeps the arrow on its label's last line. */}
                  {sort.by === column.id ? (sort.descending ? ' ↓' : ' ↑') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <BoardRow
              key={row.placed.card.key}
              projectId={projectId}
              row={row}
              moved={moved.has(row.placed.card.key)}
              asks={asks}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One cell, its content at the top of the row. */
function Cell({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-1.5 py-1.5 align-top ${className}`}>{children}</td>;
}

function BoardRow({
  projectId,
  row,
  moved,
  asks,
}: {
  projectId: string;
  row: TableRow;
  moved: boolean;
  asks: BoardAsks;
}): ReactElement {
  const { card } = row.placed;
  return (
    <tr
      data-card={card.key}
      data-moved={moved ? 'true' : undefined}
      className={`border-b border-border ${moved ? 'bg-[color:var(--accent-soft)]' : ''} motion-safe:transition-colors`}
    >
      <Cell>
        <ItemLink projectId={projectId} itemKey={card.key} />
      </Cell>
      <Cell className="min-w-48 text-text-primary">{card.title}</Cell>
      <Cell>
        {card.order === null ? null : <ItemLink projectId={projectId} itemKey={card.order} />}
      </Cell>
      <Cell className="text-text-secondary">{row.column}</Cell>
      <Cell className="max-w-48 text-text-secondary">
        <StageCell stage={row.stage} run={card.run} />
      </Cell>
      <Cell>
        <span className="flex items-center gap-2">
          <PillBadge pill={card.pill} />
          <RowAnswer card={card} asks={asks} />
        </span>
      </Cell>
      <Cell className="whitespace-nowrap">
        {card.round === null ? null : <RoundDots round={card.round} />}
      </Cell>
      <Cell>{card.returned === null ? null : `×${card.returned.count.toString()}`}</Cell>
      <Cell>{card.change === null ? null : <ChangeCell change={card.change} />}</Cell>
      <Cell className="whitespace-nowrap text-text-tertiary">
        <MergedWhen full={card.mergedAt} iso={row.placed.item.progress?.change?.mergedAt} />
      </Cell>
      <Cell
        className={`min-w-40 max-w-56 ${card.pill === 'failed' ? 'text-error' : 'text-warning'}`}
      >
        <span title={card.stopLine ?? undefined} className="line-clamp-2">
          <RowAsk card={card} asks={asks} />
        </span>
      </Cell>
    </tr>
  );
}

function ItemLink({ projectId, itemKey }: { projectId: string; itemKey: string }): ReactElement {
  return (
    <Link
      to={itemPath(projectId, itemKey)}
      className="font-mono text-console-12 text-accent-bright hover:underline"
    >
      {itemKey}
    </Link>
  );
}

/**
 * The stage it sits in, and under it, while a run works it, the running step as the card's
 * stage line says it ("Checks · Code review · round 2"), linking to the run.
 */
function StageCell({ stage, run }: { stage: string | null; run: BoardCard['run'] }): ReactNode {
  if (run === null) return stage;
  return (
    <span className="flex flex-col">
      {stage}
      <Link
        to={run.href}
        title={engineIdTitle(run.text, run.step)}
        className={`line-clamp-2 hover:underline ${statusTextClass.running}`}
      >
        {run.parts[0] === stage ? run.parts.slice(1).join(' · ') : run.text}
      </Link>
    </span>
  );
}

function ChangeCell({ change }: { change: NonNullable<BoardCard['change']> }): ReactElement {
  return (
    <span className="flex flex-col">
      {change.href === null ? (
        <span className="whitespace-nowrap text-text-secondary">{change.label}</span>
      ) : (
        <a
          href={change.href}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap text-accent-bright hover:underline"
        >
          {change.label}
        </a>
      )}
      <MergeState state={change.mergeState} />
    </span>
  );
}

/** When it merged, short ("Nov 17, 14:05") in local time; the full time on hover. */
function MergedWhen({
  full,
  iso,
}: {
  full: string | null;
  iso: string | null | undefined;
}): ReactNode {
  if (full === null || iso == null) return full;
  return <span title={full}>{shortDateTime(iso)}</span>;
}
