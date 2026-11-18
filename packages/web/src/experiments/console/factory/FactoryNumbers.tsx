import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { errorDetail } from '../lib/http';
import { useFactoryItems } from './useFactoryItems';
import { boardModel, type FactoryDeclaration } from './lib/board';
import type { BoardShow } from './lib/board-show';
import { durationWords } from './lib/duration';
import { factoryNumbers, type FactoryNumbers as Numbers } from './lib/numbers';
import { factoryPath } from './lib/views';
import { FactoryLoading } from './FactoryLoading';
import { readFailed, SlowReadError } from './lib/deadline';
import { StaleRead } from './StaleRead';

/** "Merged today" turns over at midnight without a reload. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return (): void => {
      clearInterval(timer);
    };
  }, []);
  return now;
}

/** Why a tile has no value yet: the items are not read, or a merge answer is outstanding. */
type TileWait = 'items' | 'merge';

const WAIT_TITLE: Record<TileWait, string> = {
  items: 'Loading',
  merge: 'Checking which changes merged',
};

/** A tile that waits says it is loading, never a wrong count. */
type TileValue = { wait: TileWait } | { wait: null; value: string };

type Tile = TileValue & { show: BoardShow; label: string };

/** The five tiles, each saying "…" while `numbers` is not read (undefined). */
function tiles(numbers: Numbers | undefined): Tile[] {
  const read = (value: (n: Numbers) => string): TileValue =>
    numbers === undefined ? { wait: 'items' } : { wait: null, value: value(numbers) };
  // Every number but "needs you" depends on which items landed (placement rule 2).
  const merged = (value: (n: Numbers) => string): TileValue =>
    numbers?.pending === true ? { wait: 'merge' } : read(value);
  return [
    { show: 'in-flight', ...merged(n => n.inFlight.toString()), label: 'in flight' },
    {
      show: 'needs-you',
      ...read(n => n.needsYou.toString()),
      // Counted per item: the sub-navigation's badge counts asks and waits, and an item can
      // have several, so the words keep the two numbers from reading as a contradiction.
      label: numbers?.needsYou === 1 ? 'item needs you' : 'items need you',
    },
    { show: 'landed-today', ...merged(n => n.landedToday.toString()), label: 'merged today' },
    {
      show: 'landed',
      ...merged(n => `${n.landed.toString()} of ${n.total.toString()}`),
      label: 'done',
    },
    {
      show: 'landed',
      ...merged(n => (n.medianToLandMs === null ? 'none yet' : durationWords(n.medianToLandMs))),
      label: 'median from first run to merged',
    },
  ];
}

/**
 * The Overview's numbers strip. It reads the board's items under the board's cache key and
 * counts with the board's own filter, so each number matches the board it links to.
 */
export function FactoryNumbers({
  projectId,
  view,
}: {
  projectId: string;
  view: FactoryDeclaration;
}): ReactElement {
  const items = useFactoryItems(projectId);
  const now = useMinuteClock();
  const numbers = useMemo(
    () =>
      items.data === undefined
        ? undefined
        : factoryNumbers(boardModel(view, projectId, items.data, new Map()), now),
    [view, projectId, items.data, now]
  );
  const failed = readFailed(items.error);
  if (numbers === undefined && failed !== undefined)
    return (
      <p role="alert" className="text-sm text-error">
        The numbers could not be loaded: {errorDetail(failed)}
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {numbers === undefined ? null : <StaleRead error={items.error} />}
      <ul aria-label="Numbers" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles(numbers).map(tile => (
          <NumberTile key={tile.label} projectId={projectId} tile={tile} />
        ))}
      </ul>
      {/* Before the first answer the tiles say "…"; a read past its deadline says so too. */}
      {numbers === undefined && items.error instanceof SlowReadError ? (
        <FactoryLoading read={items} />
      ) : null}
    </div>
  );
}

function NumberTile({ projectId, tile }: { projectId: string; tile: Tile }): ReactElement {
  return (
    <li>
      <Link
        to={factoryPath(projectId, `/board?show=${tile.show}`)}
        className="flex h-full flex-col gap-0.5 rounded-console-12 border border-border bg-surface px-3 py-2 transition-colors hover:border-border-bright"
      >
        <span className="text-lg font-medium tabular-nums text-text-primary">
          {tile.wait === null ? (
            tile.value
          ) : (
            <span title={WAIT_TITLE[tile.wait]}>
              <span aria-hidden="true">…</span>
              <span className="sr-only">Loading</span>
            </span>
          )}
        </span>
        <span className="text-console-12 text-text-secondary">{tile.label}</span>
      </Link>
    </li>
  );
}
