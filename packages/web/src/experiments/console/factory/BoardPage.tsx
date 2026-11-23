import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { askNaming, itemNames } from '../lib/ask-naming';
import { errorDetail } from '../lib/http';
import type { AttentionQueue } from '../skills/runs';
import type { EntityView } from '../store/cache';
import { BoardAskPopover } from './BoardAskPopover';
import { BoardSkeleton } from './BoardSkeleton';
import { BoardPipeline } from './BoardPipeline';
import { BoardTable } from './BoardTable';
import { BoardToolbar } from './BoardToolbar';
import { EndedRows } from './EndedRows';
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
import type { BoardShowSpec } from './lib/board-show';
import { FactoryLoading } from './FactoryLoading';
import { readFailed } from './lib/deadline';
import { highlightedKeys, ORDER_PARAM, workOrders, type WorkOrder } from './lib/work-orders';
import { useBoardAsks, type BoardAsks } from './useBoardAsks';
import { useBoardShow } from './useBoardShow';

/** How long a card that changed stage stays highlighted. */
const MOVED_MS = 1500;

/** `/console/p/:projectId/factory/board`: every item, in the column holding its stage. */
export function BoardPage(): ReactElement {
  const { projectId = '' } = useParams<{ projectId: string }>();
  return (
    <FactoryFrame section="board" wide fill>
      {(view, attention) => (
        <Board projectId={projectId} view={view.declaration} attention={attention} />
      )}
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
  attention,
  now,
}: {
  projectId: string;
  view: FactoryDeclaration;
  /** The project's attention queue, the one read Needs you draws: each card's asks come from it. */
  attention: EntityView<AttentionQueue>;
  /** The time the Merged column's window counts back from; the clock at render when absent. */
  now?: Date;
}): ReactElement {
  const read = useFactoryItemsRead(projectId);
  const items = read.data?.items;
  const [params] = useSearchParams();
  const { showParam, show, spec, table, setView, clearShow } = useBoardShow();
  const [query, setQuery] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const lit = params.get(ORDER_PARAM);
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
  const asks = useBoardAsks({ all, shown, queue: attention.data, declaration: view });
  const names = useMemo(() => itemNames(items), [items]);
  const naming = useMemo(
    () => askNaming(projectId, { declaration: view }, names),
    [projectId, view, names]
  );
  const showView = (next: 'pipeline' | 'table'): void => {
    // Its trigger is in the view being left.
    asks.close();
    setView(next);
  };
  return (
    <div className="flex flex-col gap-3 md:min-h-0 md:flex-1">
      <BoardToolbar
        query={query}
        onQuery={setQuery}
        table={table}
        onView={showView}
        showParam={showParam}
        show={show}
        onClearShow={clearShow}
      >
        {/* What the Pipeline alone draws shares the toolbar's line, so the columns keep the
            height: the work orders' summary, the folded endings, the hidden-columns hint. */}
        {table ? null : (
          <>
            <WorkOrdersStrip projectId={projectId} orders={orders} lit={lit} />
            <span className="flex flex-wrap items-center gap-3 md:ml-auto">
              {shown === undefined ? null : <EndedRows projectId={projectId} ended={shown.ended} />}
              {hint === null ? null : (
                // Only where the columns sit side by side: on a phone they stack and none is hidden.
                <span
                  className="hidden text-console-12 text-text-tertiary md:inline"
                  aria-live="polite"
                >
                  {hint} →
                </span>
              )}
            </span>
          </>
        )}
      </BoardToolbar>
      <BoardBody
        projectId={projectId}
        view={view}
        read={read}
        model={shown}
        table={table}
        // A new show opens the Table on its own sort.
        showKey={showParam}
        spec={spec}
        moved={moved}
        orders={orders}
        lit={lit}
        onHint={setHint}
        now={now ?? new Date()}
        // filterBoard returns its input unchanged when nothing narrows it, so this is its own
        // answer to "is the board narrowed", not a second copy of that condition.
        filtered={shown !== all}
        asks={asks}
      />
      <BoardAskPopover projectId={projectId} board={asks} queue={attention.data} naming={naming} />
      {view.discoveries === undefined ? null : (
        // Never shrunk by the board's fill height: the panel's own lines and link stay whole.
        <div className="shrink-0">
          <FoundByTheFactory
            projectId={projectId}
            names={names}
            above={shown !== undefined}
            oneLine
            opened={spec?.panel === true}
          />
        </div>
      )}
    </div>
  );
}

function BoardBody({
  projectId,
  view,
  read,
  model,
  table,
  showKey,
  spec,
  moved,
  orders,
  lit,
  now,
  filtered,
  asks,
  onHint,
}: {
  projectId: string;
  view: FactoryDeclaration;
  read: ReturnType<typeof useFactoryItemsRead>;
  model: BoardModel | undefined;
  table: boolean;
  showKey: string | null;
  /** The show's spec: the sort the Table opens on and the rows it marks. */
  spec: BoardShowSpec | undefined;
  moved: ReadonlySet<string>;
  orders: readonly WorkOrder[];
  /** The work order `?order=` lights; null when none. */
  lit: string | null;
  now: Date;
  filtered: boolean;
  asks: BoardAsks;
  onHint: (hint: string | null) => void;
}): ReactElement {
  if (model === undefined) {
    const failed = readFailed(read.error);
    if (failed !== undefined)
      return (
        <p role="alert" className="text-console-14 text-error">
          The board could not be loaded: {errorDetail(failed)}
        </p>
      );
    return (
      <FactoryLoading read={read}>
        <BoardSkeleton view={view} />
      </FactoryLoading>
    );
  }
  return (
    <>
      <StaleRead error={read.error} />
      {table ? (
        <BoardTable
          key={showKey ?? ''}
          projectId={projectId}
          model={model}
          moved={moved}
          asks={asks}
          initialSort={spec?.sort}
          mark={spec?.mark}
        />
      ) : (
        <BoardPipeline
          projectId={projectId}
          model={model}
          moved={moved}
          lit={highlightedKeys(orders.find(order => order.key === lit))}
          now={now}
          filtered={filtered}
          asks={asks}
          onHint={onHint}
        />
      )}
    </>
  );
}
