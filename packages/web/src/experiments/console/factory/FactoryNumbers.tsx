import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { errorDetail } from '../lib/http';
import { useFactoryItems } from './useFactoryItems';
import { boardModel, type FactoryDeclaration } from './lib/board';
import type { BoardShow } from './lib/board-show';
import { durationWords } from './lib/duration';
import { factoryNumbers, type FactoryNumbers as Numbers } from './lib/numbers';
import { factoryPath } from './lib/views';
import { StaleRead } from './StaleRead';

/** "Landed today" turns over at midnight without a reload. */
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

interface Tile {
  show: BoardShow;
  /** Null while it waits on a merge answer: the tile says it is loading, never a wrong count. */
  value: string | null;
  label: string;
}

function tiles(numbers: Numbers): Tile[] {
  // Every number but "needs you" depends on which items landed (placement rule 2).
  const merged = (value: string): string | null => (numbers.pending ? null : value);
  return [
    { show: 'in-flight', value: merged(numbers.inFlight.toString()), label: 'in flight' },
    {
      show: 'needs-you',
      value: numbers.needsYou.toString(),
      // Counted per item: the sub-navigation's badge counts asks and waits, and an item can
      // have several, so the words keep the two numbers from reading as a contradiction.
      label: numbers.needsYou === 1 ? 'item needs you' : 'items need you',
    },
    { show: 'landed-today', value: merged(numbers.landedToday.toString()), label: 'landed today' },
    {
      show: 'landed',
      value: merged(`${numbers.landed.toString()} of ${numbers.total.toString()}`),
      label: 'done',
    },
    {
      show: 'landed',
      value: merged(
        numbers.medianToLandMs === null ? 'none yet' : durationWords(numbers.medianToLandMs)
      ),
      label: 'median from first run to landed',
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
  if (numbers === undefined && items.error !== undefined)
    return (
      <p role="alert" className="text-sm text-error">
        The numbers could not be loaded: {errorDetail(items.error)}
      </p>
    );
  return (
    <div className="flex flex-col gap-1.5">
      {numbers === undefined ? null : <StaleRead error={items.error} />}
      <ul aria-label="Numbers" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(numbers === undefined ? undefined : tiles(numbers))?.map(tile => (
          <NumberTile key={tile.label} projectId={projectId} tile={tile} />
        )) ?? <li className="text-xs text-text-tertiary">Loading…</li>}
      </ul>
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
          {tile.value ?? (
            <span title="Checking which changes merged">
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
