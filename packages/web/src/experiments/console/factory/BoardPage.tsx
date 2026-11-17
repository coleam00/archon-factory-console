import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { errorDetail } from '../lib/http';
import { BoardPipeline } from './BoardPipeline';
import { BoardTable } from './BoardTable';
import { useFactoryBoardItems } from './board-items';
import { FactoryFrame } from './FactoryFrame';
import {
  boardModel,
  filterBoard,
  movedKeys,
  type BoardModel,
  type FactoryDeclaration,
} from './lib/board';

/** How long a card that changed column stays highlighted. */
const MOVED_MS = 1500;
/** `?view=table` shows the Table view; Pipeline is the default. */
const VIEW_PARAM = 'view';
const TABLE_VIEW = 'table';

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
  const items = useFactoryBoardItems(projectId);
  const [params, setParams] = useSearchParams();
  const table = params.get(VIEW_PARAM) === TABLE_VIEW;
  const [query, setQuery] = useState('');
  // Where each item sat on the last read: placement keeps a run between named steps where
  // it was, and the highlight compares against it.
  const previous = useRef<ReadonlyMap<string, string>>(new Map());
  const all = useMemo(
    () =>
      items.data === undefined
        ? undefined
        : boardModel(view, projectId, items.data, previous.current),
    [view, projectId, items.data]
  );
  const moved = useMovedCards(all?.positions, previous);
  const shown = useMemo(
    () => (all === undefined ? undefined : filterBoard(all, query)),
    [all, query]
  );
  const showView = (next: 'pipeline' | 'table'): void => {
    setParams(
      current => {
        const updated = new URLSearchParams(current);
        if (next === 'table') updated.set(VIEW_PARAM, TABLE_VIEW);
        else updated.delete(VIEW_PARAM);
        return updated;
      },
      { replace: true }
    );
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
          placeholder="Filter by key or title"
          aria-label="Filter by key or title"
          className="w-56 rounded border border-border bg-surface-inset px-2.5 py-1 text-console-12 text-text-primary outline-none placeholder:text-text-tertiary focus:border-border-bright"
        />
        <div role="group" aria-label="Board view" className="flex items-center gap-1">
          <ViewToggle label="Pipeline" active={!table} onClick={() => showView('pipeline')} />
          <ViewToggle label="Table" active={table} onClick={() => showView('table')} />
        </div>
      </div>
      <BoardBody projectId={projectId} items={items} model={shown} table={table} moved={moved} />
    </div>
  );
}

function BoardBody({
  projectId,
  items,
  model,
  table,
  moved,
}: {
  projectId: string;
  items: ReturnType<typeof useFactoryBoardItems>;
  model: BoardModel | undefined;
  table: boolean;
  moved: ReadonlySet<string>;
}): ReactElement {
  if (model === undefined) {
    if (items.error !== undefined)
      return (
        <p role="alert" className="text-sm text-error">
          The board could not be loaded: {errorDetail(items.error)}
        </p>
      );
    return <p className="text-xs text-text-tertiary">Loading…</p>;
  }
  return table ? (
    <BoardTable projectId={projectId} model={model} moved={moved} />
  ) : (
    <BoardPipeline projectId={projectId} model={model} moved={moved} />
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
