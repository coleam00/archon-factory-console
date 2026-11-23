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
import { BOARD_SHOW, boardShowSearch, type BoardShow } from './lib/board-show';
import { durationWords } from './lib/duration';
import { factoryNumbers, type FactoryNumbers as Numbers } from './lib/numbers';
import { factoryPath } from './lib/views';
import { FactoryLoading } from './FactoryLoading';
import { readFailed } from './lib/deadline';
import { SkeletonFigure } from '../components/Skeleton';
import { StaleRead } from './StaleRead';
import { openFindings } from './lib/discoveries';
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

/**
 * A tile whose items are not read shows a skeleton bar (rule 6), never a wrong count and
 * never "…". One whose count leaves out items with a merge state not known yet shows the
 * known count with a skeleton bar beside it (`unsettled`).
 */
type TileValue = { value: null } | { value: string; unsettled: boolean };

type Tile = TileValue & {
  to: string;
  /** Where the tile goes, as its tooltip and accessible name say. */
  opens: string;
  label: string;
  icon: LucideIcon;
  /** What the number means, said before where it goes. */
  means?: string;
};

/** The board under `show`, and the words saying so. */
const boardLink = (projectId: string, show: BoardShow): Pick<Tile, 'to' | 'opens'> => ({
  to: factoryPath(projectId, `/board${boardShowSearch(show)}`),
  opens: BOARD_SHOW[show].opens,
});

/**
 * The five tiles, each a skeleton while `numbers` is not read (undefined). `waiting` is the
 * project's asks and waits (`needsYouCount`, undefined until the queue loads): the count the
 * Needs you tab and its heading show, so the tile links there.
 */
function tiles(
  projectId: string,
  numbers: Numbers | undefined,
  waiting: number | undefined
): Tile[] {
  const board = (show: BoardShow): Pick<Tile, 'to' | 'opens'> => boardLink(projectId, show);
  // Every number but "needs you" depends on which items merged (placement rule 2).
  const merged = (value: (n: Numbers) => string): TileValue =>
    numbers === undefined
      ? { value: null }
      : { value: value(numbers), unsettled: numbers.unsettled };
  return [
    {
      ...board('in-flight'),
      ...merged(n => n.inFlight.toString()),
      label: 'in flight',
      icon: Activity,
    },
    {
      to: needsYouPath(projectId),
      opens: 'Open Needs you',
      ...(waiting === undefined
        ? { value: null }
        : { value: waiting.toString(), unsettled: false }),
      label: waiting === 1 ? 'needs you' : 'need you',
      icon: MessageCircleQuestionMark,
    },
    {
      ...board('landed-today'),
      ...merged(n => n.landedToday.toString()),
      label: 'merged today',
      icon: GitMerge,
    },
    {
      ...board('landed-of-all'),
      ...merged(n => `${n.landed.toString()} of ${n.total.toString()}`),
      label: 'merged',
      icon: CircleCheck,
    },
    {
      ...board('median-to-land'),
      ...merged(n => (n.medianToLandMs === null ? 'none yet' : durationWords(n.medianToLandMs))),
      label: 'median to merged',
      means: "The median time from an item's first run to its change merging",
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
            opens={tile.opens}
            label={tile.label}
            icon={tile.icon}
            means={tile.means}
          >
            {tile.value === null ? <FigureSkeleton title="Loading" /> : tile.value}
            {tile.value !== null && tile.unsettled ? (
              <FigureSkeleton title="Checking which changes merged" />
            ) : null}
          </NumberTile>
        ))}
        {view.discoveries === undefined ? null : <FoundTile projectId={projectId} />}
      </ul>
    </div>
  );
}

/**
 * One number tile, in the card language (Visual standard, rules 1 and 2): an icon and the
 * label in the Label role, then the figure at the tile figure's size. Its tooltip and its
 * accessible name end with where it goes.
 */
function NumberTile({
  to,
  opens,
  label,
  icon: Icon,
  means,
  children,
}: {
  to: string;
  opens: string;
  label: string;
  icon: LucideIcon;
  means?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <li data-tile={label}>
      <Link
        to={to}
        title={means === undefined ? opens : `${means}. ${opens}`}
        className="flex h-full flex-col gap-2 rounded-console-12 border border-border bg-surface p-3 transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated"
      >
        <span className="flex items-start gap-1.5 text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          {label}
        </span>
        <span className="flex h-7 items-center gap-2 text-console-22 font-semibold tabular-nums text-text-primary">
          {children}
        </span>
        <span className="sr-only">, {opens}</span>
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
 * yet, opening the board with its panel open. Its own read, so it never holds up the other tiles; a
 * read that failed reads as a dash, and the panel says why.
 */
function FoundTile({ projectId }: { projectId: string }): ReactElement {
  const read = useFactoryDiscoveries(projectId);
  const failed = read.data === undefined && readFailed(read.error) !== undefined;
  return (
    <NumberTile {...boardLink(projectId, 'found')} label="found by the factory" icon={Search}>
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
