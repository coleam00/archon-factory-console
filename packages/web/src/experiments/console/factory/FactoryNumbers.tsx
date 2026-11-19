import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import {
  Activity,
  CircleCheck,
  GitMerge,
  type LucideIcon,
  MessageCircleQuestionMark,
  Search,
  Timer,
} from 'lucide-react';
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
import { readFailed } from './lib/deadline';
import { SkeletonFigure } from '../components/Skeleton';
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

/** A tile that waits shows a skeleton bar (rule 6), never a wrong count and never "…". */
type TileValue = { wait: TileWait } | { wait: null; value: string };

type Tile = TileValue & { to: string; label: string; icon: LucideIcon; title?: string };

/**
 * The five tiles, each a skeleton while `numbers` is not read (undefined). `waiting` is the
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
  // Every number but "needs you" depends on which items merged (placement rule 2).
  const merged = (value: (n: Numbers) => string): TileValue =>
    numbers?.pending === true ? { wait: 'merge' } : read(value);
  return [
    {
      to: board('in-flight'),
      ...merged(n => n.inFlight.toString()),
      label: 'in flight',
      icon: Activity,
    },
    {
      to: needsYouPath(projectId),
      ...(waiting === undefined
        ? { wait: 'items' as const }
        : { wait: null, value: waiting.toString() }),
      label: waiting === 1 ? 'needs you' : 'need you',
      icon: MessageCircleQuestionMark,
    },
    {
      to: board('landed-today'),
      ...merged(n => n.landedToday.toString()),
      label: 'merged today',
      icon: GitMerge,
    },
    {
      to: board('landed'),
      ...merged(n => `${n.landed.toString()} of ${n.total.toString()}`),
      label: 'merged',
      icon: CircleCheck,
    },
    {
      to: board('landed'),
      ...merged(n => (n.medianToLandMs === null ? 'none yet' : durationWords(n.medianToLandMs))),
      label: 'median to merged',
      title: "The median time from an item's first run to its change merging",
      icon: Timer,
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
      <p role="alert" className="text-console-14 text-error">
        The numbers could not be loaded: {errorDetail(failed)}
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      {numbers === undefined ? null : <StaleRead error={items.error} />}
      {/* Before the first answer the tiles show skeletons; a read past its deadline says so. */}
      {numbers === undefined ? <FactoryLoading read={items} /> : null}
      <ul
        aria-label="Numbers"
        className={`grid grid-cols-2 gap-3 ${
          view.discoveries === undefined ? 'sm:grid-cols-5' : 'sm:grid-cols-3 lg:grid-cols-6'
        }`}
      >
        {tiles(projectId, numbers, waiting).map(tile => (
          <NumberTile
            key={tile.label}
            to={tile.to}
            label={tile.label}
            icon={tile.icon}
            title={tile.title}
          >
            {tile.wait === null ? tile.value : <FigureSkeleton title={WAIT_TITLE[tile.wait]} />}
          </NumberTile>
        ))}
        {view.discoveries === undefined ? null : <FoundTile projectId={projectId} />}
      </ul>
    </div>
  );
}

/**
 * One number tile, in the card language (Visual standard, rules 1 and 2): an icon and the
 * label in the Label role, then the figure at the tile figure's size.
 */
function NumberTile({
  to,
  label,
  icon: Icon,
  title,
  children,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  title?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <li data-tile={label}>
      <Link
        to={to}
        title={title}
        className="flex h-full flex-col gap-2 rounded-console-12 border border-border bg-surface p-3 transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated"
      >
        <span className="flex items-start gap-1.5 text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {label}
        </span>
        <span className="flex h-7 items-center text-console-22 font-semibold tabular-nums text-text-primary">
          {children}
        </span>
      </Link>
    </li>
  );
}

/** A figure not known yet, with why for a screen reader and on hover. */
function FigureSkeleton({ title }: { title: string }): ReactElement {
  return (
    <span title={title} className="inline-flex items-center">
      <SkeletonFigure />
      <span className="sr-only">{title}</span>
    </span>
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
    <NumberTile
      to={factoryPath(projectId, `/board#${FOUND_BY_THE_FACTORY}`)}
      label="found by the factory"
      icon={Search}
    >
      {read.data !== undefined ? (
        openFindings(read.data).length
      ) : failed ? (
        <span title="Could not be read">–</span>
      ) : (
        <FigureSkeleton title="Loading" />
      )}
    </NumberTile>
  );
}
