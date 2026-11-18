import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { errorDetail } from '../lib/http';
import { needsYouPath } from '../lib/needs-you';
import { useFactoryItems } from './useFactoryItems';
import { boardModel, type FactoryDeclaration } from './lib/board';
import type { BoardShow } from './lib/board-show';
import { durationWords } from './lib/duration';
import { factoryNumbers, type FactoryNumbers as Numbers } from './lib/numbers';
import { factoryPath } from './lib/views';
import { FactoryLoading } from './FactoryLoading';
import { readFailed, SlowReadError } from './lib/deadline';
import { StaleRead } from './StaleRead';
import { FOUND_BY_THE_FACTORY, openFindings } from './lib/discoveries';
import { useFactoryDiscoveries } from './useFactoryDiscoveries';

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

type Tile = TileValue & { to: string; label: string };

/**
 * The five tiles, each saying "…" while `numbers` is not read (undefined). `waiting` is the
 * project's asks and waits (`needsYouCount`, undefined until the queue loads): the count the
 * Needs you tab, its heading and the sub-navigation show, so the tile links there.
 */
function tiles(
  projectId: string,
  numbers: Numbers | undefined,
  waiting: number | undefined
): Tile[] {
  const board = (show: BoardShow): string => factoryPath(projectId, `/board?show=${show}`);
  const read = (value: (n: Numbers) => string): TileValue =>
    numbers === undefined ? { wait: 'items' } : { wait: null, value: value(numbers) };
  // Every number but "needs you" depends on which items landed (placement rule 2).
  const merged = (value: (n: Numbers) => string): TileValue =>
    numbers?.pending === true ? { wait: 'merge' } : read(value);
  return [
    { to: board('in-flight'), ...merged(n => n.inFlight.toString()), label: 'in flight' },
    {
      to: needsYouPath(projectId),
      ...(waiting === undefined
        ? { wait: 'items' as const }
        : { wait: null, value: waiting.toString() }),
      label: waiting === 1 ? 'needs you' : 'need you',
    },
    { to: board('landed-today'), ...merged(n => n.landedToday.toString()), label: 'merged today' },
    {
      to: board('landed'),
      ...merged(n => `${n.landed.toString()} of ${n.total.toString()}`),
      label: 'done',
    },
    {
      to: board('landed'),
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
  waiting,
}: {
  projectId: string;
  view: FactoryDeclaration;
  /** The project's asks and waits (`needsYouCount`); undefined until the queue loads. */
  waiting: number | undefined;
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
      <ul
        aria-label="Numbers"
        className={`grid grid-cols-2 gap-2 ${
          view.discoveries === undefined ? 'sm:grid-cols-5' : 'sm:grid-cols-3 lg:grid-cols-6'
        }`}
      >
        {tiles(projectId, numbers, waiting).map(tile => (
          <NumberTile key={tile.label} tile={tile} />
        ))}
        {view.discoveries === undefined ? null : <FoundTile projectId={projectId} />}
      </ul>
      {/* Before the first answer the tiles say "…"; a read past its deadline says so too. */}
      {numbers === undefined && items.error instanceof SlowReadError ? (
        <FactoryLoading read={items} />
      ) : null}
    </div>
  );
}

function NumberTile({ tile }: { tile: Tile }): ReactElement {
  return (
    <li>
      <Link
        to={tile.to}
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

/**
 * "found by the factory": what the discoveries drains decided to file that no item carries
 * yet, linking to the board's panel. Its own read, so it never holds up the other tiles; a
 * read that failed reads as a dash, and the panel says why.
 */
function FoundTile({ projectId }: { projectId: string }): ReactElement {
  const read = useFactoryDiscoveries(projectId);
  const failed = read.data === undefined && readFailed(read.error) !== undefined;
  return (
    <li>
      <Link
        to={factoryPath(projectId, `/board#${FOUND_BY_THE_FACTORY}`)}
        className="flex h-full flex-col gap-0.5 rounded-console-12 border border-border bg-surface px-3 py-2 transition-colors hover:border-border-bright"
      >
        <span className="text-console-22 font-semibold tabular-nums text-text-primary">
          {read.data !== undefined ? (
            openFindings(read.data).length
          ) : failed ? (
            <span title="Could not be read">–</span>
          ) : (
            <span className="inline-flex h-7 items-center">
              <span
                aria-hidden
                className="h-5.5 w-12 rounded bg-surface-elevated motion-safe:animate-pulse"
              />
              <span className="sr-only">Loading</span>
            </span>
          )}
        </span>
        <span className="text-console-12 text-text-secondary">found by the factory</span>
      </Link>
    </li>
  );
}
