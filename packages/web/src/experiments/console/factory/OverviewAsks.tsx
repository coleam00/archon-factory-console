import { useMemo, type ReactElement, type ReactNode } from 'react';
import { Link } from 'react-router';
import { relativeTime } from '../lib/format';
import type { FactoryItem } from './api';
import { AskQuestionLine, OpenAsksChip, openAsksWords, RecommendedChip } from './BoardCardAsk';
import { ItemAsksPopover, type AskedItem } from './ItemAsksPopover';
import {
  askQuestion,
  awaitingItems,
  newestFirst,
  recommendedLabel,
  waitingRefs,
  type OpenEntry,
} from './lib/attention';
import { boardModel, type BoardModel, type FactoryDeclaration, type PlacedCard } from './lib/board';
import { boardShowSearch } from './lib/board-show';
import { displayItemKey } from './lib/item-key';
import { factoryPath } from './lib/views';
import { useBoardAsks, type BoardAsks } from './useBoardAsks';
import type { FactoryAsks } from './useItemAsks';
import { useMinuteClock } from './useMinuteClock';

/** How many rows the Overview's Needs you shows before "N more" leads to the board. */
const OVERVIEW_ROWS_SHOWN = 3;

/** A board card with something open on it, and what is open, newest first. */
interface AskedCard {
  placed: PlacedCard;
  first: OpenEntry;
  entries: OpenEntry[];
}

/** The board's cards with something open on them, by their newest entry, newest first. */
function askedCards(model: BoardModel, asks: FactoryAsks): AskedCard[] {
  const asked: AskedCard[] = [];
  for (const column of model.columns)
    for (const placed of column.cards) {
      const entries = asks.entriesOf(placed.item);
      const [first] = entries;
      if (first !== undefined) asked.push({ placed, first, entries });
    }
  return asked.sort((a, b) => newestFirst(a.first, b.first));
}

/**
 * How many more wait than the rows show: what waits by ref and is not answered here, less what
 * the rows hold, and the items waiting on you with no ask open. So the rows and this line add
 * up to the Need you number; an ask whose item is not on the board is counted here.
 */
function moreCount(items: readonly FactoryItem[], asks: FactoryAsks, rows: AskedCard[]): number {
  const answered = new Set(asks.section.answered.map(record => record.ask.ref));
  const shown = new Set(rows.flatMap(row => row.entries.map(entry => entry.ref)));
  const rest = [...waitingRefs(items, asks.asks)].filter(
    ref => !answered.has(ref) && !shown.has(ref)
  );
  return rest.length + awaitingItems(items).length;
}

/** Each item on the board's columns, by key, as the ask view names it. */
function askedItems(model: BoardModel | undefined): Map<string, AskedItem> {
  return new Map(
    (model?.columns ?? []).flatMap(column =>
      column.cards.map(({ item, card }) => [
        card.key,
        { item, title: card.title, order: card.order },
      ])
    )
  );
}

/**
 * The Overview's Needs you, as compact rows: the newest three items with an ask open, each
 * naming the item, its stage and how long its newest ask has waited, the question in one line
 * and the option its workflow recommends. A row opens Archon's own ask section for the item
 * over the page, as a board card does, and it is answered there. Then how many more wait, the
 * items waiting on you with no ask open (`awaitingItems`) among them, linking to the board's
 * "needs you" show. Nothing shows when nothing waits.
 */
export function OverviewAsks({
  projectId,
  view,
  items,
  asks,
}: {
  projectId: string;
  view: FactoryDeclaration;
  items: readonly FactoryItem[] | undefined;
  asks: FactoryAsks;
}): ReactNode {
  const now = useMinuteClock();
  // The board's own model, as the numbers read it, so a row is a card the ask view can open.
  const model = useMemo(
    () => (items === undefined ? undefined : boardModel(view, projectId, items, new Map(), now)),
    [view, projectId, items, now]
  );
  const board = useBoardAsks({ all: model, shown: model, asks });
  const asked = useMemo(() => askedItems(model), [model]);
  const rows = model === undefined ? [] : askedCards(model, asks).slice(0, OVERVIEW_ROWS_SHOWN);
  const more = items === undefined ? 0 : moreCount(items, asks, rows);
  return (
    <>
      {rows.length === 0 && more === 0 ? null : (
        <section aria-label="Needs you" className="flex max-w-3xl flex-col gap-2">
          <h3 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
            Needs you
          </h3>
          {rows.length === 0 ? null : (
            <ul className="flex flex-col gap-2">
              {rows.map(row => (
                <li key={row.placed.card.key}>
                  <NeedsYouRow row={row} board={board} now={now} />
                </li>
              ))}
            </ul>
          )}
          {more > 0 ? <MoreLink projectId={projectId} more={more} shown={rows.length > 0} /> : null}
        </section>
      )}
      {/* Outside the section: an ask answered in the view stays in it after its row is gone. */}
      <ItemAsksPopover
        projectId={projectId}
        board={board}
        asks={asks}
        itemOf={key => asked.get(key)}
      />
    </>
  );
}

/**
 * One row: the item's key and title, its stage and the newest ask's age on the first line;
 * the question in one line, the recommended option and how many asks are open on the second.
 * The whole row is the control that opens the item's ask view.
 */
function NeedsYouRow({
  row,
  board,
  now,
}: {
  row: AskedCard;
  board: BoardAsks;
  now: Date;
}): ReactElement {
  const { item, card } = row.placed;
  const { first } = row;
  const question = askQuestion(first);
  const recommended = recommendedLabel(first);
  const count = row.entries.length;
  const where = [
    card.stage,
    first.pausedAt === null ? null : relativeTime(first.pausedAt, now.getTime()),
  ].filter((part): part is string => part !== null);
  return (
    <button
      type="button"
      data-ask-trigger={card.key}
      aria-haspopup="dialog"
      aria-expanded={board.open?.key === card.key}
      aria-label={`${openAsksWords(count)} on ${card.title}: ${question}`}
      onClick={event => {
        board.openFor(card.key, event.currentTarget);
      }}
      className="flex w-full min-w-0 flex-col items-start gap-2 rounded-console-12 border border-border bg-surface px-3 py-2 text-left transition-colors duration-150 ease-out hover:border-border-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* Under md the title takes a line of its own, so a work order's long key never squeezes
          it out; from md up key, title, stage and age share one line. */}
      <span className="flex w-full min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-console-13 md:flex-nowrap">
        <span className="min-w-0 truncate font-mono text-text-secondary md:shrink-0">
          {displayItemKey(item.item.key, card.order)}
        </span>
        <span
          title={card.title}
          className="min-w-0 basis-full truncate font-medium text-text-primary max-md:order-last md:basis-auto"
        >
          {card.title}
        </span>
        {where.length === 0 ? null : (
          <span className="shrink-0 text-text-tertiary">· {where.join(' · ')}</span>
        )}
      </span>
      <AskQuestionLine question={question} />
      {recommended === null && count === 1 ? null : (
        <span className="flex max-w-full flex-wrap items-center gap-2">
          {recommended === null ? null : <RecommendedChip label={recommended} />}
          {count > 1 ? <OpenAsksChip words={openAsksWords(count)} /> : null}
        </span>
      )}
    </button>
  );
}

/**
 * The line to the board's "needs you" show: "N more on the board" under the rows shown, or,
 * with none to show (only items waiting on you with no ask open), how many items wait there.
 */
function MoreLink({
  projectId,
  more,
  shown,
}: {
  projectId: string;
  more: number;
  shown: boolean;
}): ReactElement {
  return (
    <Link
      to={factoryPath(projectId, `/board${boardShowSearch('needs-you')}`)}
      className="self-start text-console-13 text-text-secondary hover:text-text-primary hover:underline"
    >
      {shown
        ? `${more.toString()} more on the board`
        : `${more.toString()} ${more === 1 ? 'item waits' : 'items wait'} for you on the board`}
    </Link>
  );
}
