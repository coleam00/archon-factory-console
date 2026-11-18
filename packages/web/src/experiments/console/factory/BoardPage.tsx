import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { errorDetail } from '../lib/http';
import { BoardPipeline } from './BoardPipeline';
import { BoardTable } from './BoardTable';
import { StaleRead } from './StaleRead';
import { useFactoryItemsRead } from './useFactoryItems';
import { WorkOrdersStrip } from './WorkOrdersStrip';
import { FactoryFrame } from './FactoryFrame';
import { FoundByTheFactory } from './FoundByTheFactory';
import {
  boardModel,
  filterBoard,
  movedKeys,
  type BoardModel,
  type FactoryDeclaration,
} from './lib/board';
import { BOARD_SHOW_LABEL, parseBoardShow, type BoardShow } from './lib/board-show';
import { FactoryLoading } from './FactoryLoading';
import { readFailed } from './lib/deadline';
import { highlightedKeys, ORDER_PARAM, workOrders, type WorkOrder } from './lib/work-orders';

/** How long a card that changed column stays highlighted. */
const MOVED_MS = 1500;
/** `?view=table` shows the Table view; Pipeline is the default. */
const VIEW_PARAM = 'view';
const TABLE_VIEW = 'table';
/** `?show=` narrows the board to what one of the Overview's numbers counts. */
const SHOW_PARAM = 'show';

/** `/console/p/:projectId/factory/board`: every item, in the column of the stage it is in. */
export function BoardPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="board" wide>
      {view => <Board projectId={projectId} view={view.declaration} />}
    </FactoryFrame>
  );
}

/**
 * The cards that changed column since the last read, for `MOVED_MS`; `previous` keeps the
 * last read's positions. The first read moves nothing, and the filter cannot move a card:
 * `positions` covers every item, filtered or not.
 */
function useMovedCards(
  positions: ReadonlyMap<string, string> | undefined,
  previous: { current: ReadonlyMap<string, string> }
): ReadonlySet<string> {
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (positions === undefined) return;
    const before = previous.current;
    previous.current = positions;
    const keys = movedKeys(before, positions);
    if (keys.length > 0) setMoved(new Set(keys));
  }, [positions, previous]);
  // The clearing timer follows `moved`, not the reads: a refetch that moves nothing (several
  // arrive within a second while checks start) must not cancel it and leave a card lit.
  useEffect(() => {
    if (moved.size === 0) return;
    const timer = setTimeout(() => {
      setMoved(new Set());
    }, MOVED_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [moved]);
  return moved;
}

export function Board({
  projectId,
  view,
}: {
  projectId: string;
  view: FactoryDeclaration;
}): ReactElement {
  const read = useFactoryItemsRead(projectId);
  const items = read.data?.items;
  const [params, setParams] = useSearchParams();
  const table = params.get(VIEW_PARAM) === TABLE_VIEW;
  const showParam = params.get(SHOW_PARAM);
  const show = showParam === null ? undefined : parseBoardShow(showParam);
  const [query, setQuery] = useState('');
  // Where each item sat on the last read: placement keeps a run between named steps where
  // it was, and the highlight compares against it.
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const all = useMemo(
    () => (items === undefined ? undefined : boardModel(view, projectId, items, previous.current)),
    [view, projectId, items]
  );
  // From the unfiltered board, so the filter box never changes an order's count.
  const orders = useMemo(
    () =>
      all === undefined || read.data === undefined
        ? []
        : workOrders(read.data.items, all, read.data.members),
    [all, read.data]
  );
  const moved = useMovedCards(all?.positions, previous);
  const shown = useMemo(
    () => (all === undefined ? undefined : filterBoard(all, query, show)),
    [all, query, show]
  );
  const setParam = (name: string, value: string | null): void => {
    setParams(
      current => {
        const updated = new URLSearchParams(current);
        if (value === null) updated.delete(name);
        else updated.set(name, value);
        return updated;
      },
      { replace: true }
    );
  };
  const showView = (next: 'pipeline' | 'table'): void => {
    setParam(VIEW_PARAM, next === 'table' ? TABLE_VIEW : null);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={event => {
            setQuery(event.target.value);
          }}
          placeholder="Filter by key, title or order"
          aria-label="Filter by key, title or work order"
          className="w-56 rounded border border-border bg-surface-inset px-2.5 py-1 text-console-12 text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-bright"
        />
        <div role="group" aria-label="Board view" className="flex items-center gap-1">
          <ViewToggle label="Pipeline" active={!table} onClick={() => showView('pipeline')} />
          <ViewToggle label="Table" active={table} onClick={() => showView('table')} />
        </div>
        <ShowChip
          param={showParam}
          show={show}
          onClear={() => {
            setParam(SHOW_PARAM, null);
          }}
        />
      </div>
      <BoardBody
        projectId={projectId}
        read={read}
        model={shown}
        table={table}
        moved={moved}
        orders={orders}
        lit={params.get(ORDER_PARAM)}
      />
      {view.discoveries === undefined ? null : <FoundByTheFactory projectId={projectId} />}
    </div>
  );
}

function BoardBody({
  projectId,
  read,
  model,
  table,
  moved,
  orders,
  lit,
}: {
  projectId: string;
  read: ReturnType<typeof useFactoryItemsRead>;
  model: BoardModel | undefined;
  table: boolean;
  moved: ReadonlySet<string>;
  orders: readonly WorkOrder[];
  /** The work order `?order=` lights; null when none. */
  lit: string | null;
}): ReactElement {
  if (model === undefined) {
    const failed = readFailed(read.error);
    if (failed !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          The board could not be loaded: {errorDetail(failed)}
        </p>
      );
    return <FactoryLoading read={read} />;
  }
  return (
    <>
      <StaleRead error={read.error} />
      {table ? (
        <BoardTable projectId={projectId} model={model} moved={moved} />
      ) : (
        <>
          <WorkOrdersStrip projectId={projectId} orders={orders} lit={lit} />
          <BoardPipeline
            projectId={projectId}
            model={model}
            moved={moved}
            lit={highlightedKeys(orders.find(order => order.key === lit))}
          />
        </>
      )}
    </>
  );
}

/**
 * The number the board was opened from, with a way back to every item. A `show` no filter
 * has says so rather than quietly showing everything.
 */
function ShowChip({
  param,
  show,
  onClear,
}: {
  param: string | null;
  show: BoardShow | undefined;
  onClear: () => void;
}): ReactElement | null {
  if (param === null) return null;
  return (
    <span
      role={show === undefined ? 'alert' : undefined}
      className={`flex items-center gap-2 rounded border px-2 py-0.5 text-console-12 ${
        show === undefined
          ? 'border-error/40 bg-error/10 text-error'
          : 'border-border bg-surface-elevated text-text-primary'
      }`}
    >
      {show === undefined ? `Unknown filter "${param}"` : `Showing: ${BOARD_SHOW_LABEL[show]}`}
      <button
        type="button"
        onClick={onClear}
        className="text-text-tertiary hover:text-text-primary"
        aria-label="Show every item"
      >
        Show all
      </button>
    </span>
  );
}

function ViewToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded px-2 py-1 text-console-12 font-medium transition-colors ${
        active
          ? 'bg-surface-elevated text-text-primary'
          : 'text-text-tertiary hover:text-text-primary'
      }`}
    >
      {label}
    </button>
  );
}
