import { useState, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { PillBadge, RoundDots } from './BoardCard';
import type { BoardModel } from './lib/board';
import { itemPath } from './lib/board';
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
}: {
  projectId: string;
  model: BoardModel;
  moved: ReadonlySet<string>;
}): ReactElement {
  const [sort, setSort] = useState<TableSort>({ by: 'column', descending: false });
  const rows = sortRows(tableRows(model), sort);
  const sortBy = (by: TableColumnId): void => {
    setSort(current => ({ by, descending: current.by === by ? !current.descending : false }));
  };
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-console-12">
        <thead>
          <tr className="border-b border-border text-console-11 uppercase tracking-wider text-text-tertiary">
            {TABLE_COLUMNS.map(column => (
              <th
                key={column.id}
                scope="col"
                aria-sort={
                  sort.by === column.id ? (sort.descending ? 'descending' : 'ascending') : undefined
                }
                className="whitespace-nowrap px-2 py-1.5 font-medium"
              >
                <button
                  type="button"
                  onClick={() => {
                    sortBy(column.id);
                  }}
                  className="uppercase tracking-wider hover:text-text-primary"
                >
                  {column.label}
                  {sort.by === column.id ? (sort.descending ? ' ↓' : ' ↑') : ''}
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
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardRow({
  projectId,
  row,
  moved,
}: {
  projectId: string;
  row: TableRow;
  moved: boolean;
}): ReactElement {
  const { card } = row.placed;
  const cell = (content: ReactNode, className = ''): ReactElement => (
    <td className={`px-2 py-1.5 align-top ${className}`}>{content}</td>
  );
  return (
    <tr
      data-moved={moved ? 'true' : undefined}
      className={`border-b border-border ${moved ? 'bg-accent-soft' : ''} motion-safe:transition-colors`}
    >
      {cell(
        <Link
          to={itemPath(projectId, card.key)}
          className="font-mono text-console-11 text-accent-bright hover:underline"
        >
          {card.key}
        </Link>
      )}
      {cell(card.title, 'min-w-48 text-text-primary')}
      {cell(row.column, 'whitespace-nowrap text-text-secondary')}
      {cell(<PillBadge pill={card.pill} />)}
      {cell(card.round === null ? null : <RoundDots round={card.round} />, 'whitespace-nowrap')}
      {cell(
        card.run === null ? null : (
          <Link to={card.run.href} className="font-mono text-console-11 hover:underline">
            {card.run.text}
          </Link>
        )
      )}
      {cell(card.returned === null ? null : `×${card.returned.count.toString()}`)}
      {cell(
        card.change === null ? null : (
          <a
            href={card.change.href}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-accent-bright hover:underline"
          >
            {card.change.label}
          </a>
        )
      )}
      {cell(card.landedAt, 'whitespace-nowrap text-text-tertiary')}
      {cell(
        card.stopLine,
        card.pill === 'failed' ? 'min-w-48 text-error' : 'min-w-48 text-warning'
      )}
    </tr>
  );
}
