import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Inbox } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { BoardCard, MergedCard } from './BoardCard';
import { ColumnHeader, toneColor } from './ColumnHeader';
import { columnChips, type BoardColumn as BoardColumnModel, type PlacedCard } from './lib/board';
import { earlierSearch, MERGED_DAYS } from './lib/merged-window';

/** How many cards a stacked column (a phone) shows before "show all N". */
const PHONE_CARDS = 3;

/**
 * Whether the element has more content below what it shows: its bottom fade shows then. It
 * measures again on scroll, on a resize, and whenever `content` (the shown cards' keys)
 * changes, so a filter or a refresh that changes the cards never leaves a stale fade. Where
 * there is no `ResizeObserver` (a server render, a test DOM), a resize alone is not seen.
 */
function useMoreBelow(ref: RefObject<HTMLElement | null>, content: string): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const update = (): void => {
      setMore(element.scrollTop + element.clientHeight < element.scrollHeight - 1);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return (): void => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref, content]);
  return more;
}

/**
 * One board column: its header, then its cards in a body that scrolls on its own from md up,
 * fading at the bottom while more cards are below. Stacked on a phone, it shows its first
 * `PHONE_CARDS` cards and "show all N". The Merged column lists `recent` only, with a link
 * to the Table for the `earlier` rest.
 */
export function BoardColumn({
  projectId,
  column,
  merged,
  filtered,
  moved,
  lit,
}: {
  projectId: string;
  column: BoardColumnModel;
  /** The filter box or `?show=` narrows the board: an empty column may hold work. */
  filtered: boolean;
  /** For the Merged column: its window (`mergedWindow`). Undefined for every other column. */
  merged?: { recent: PlacedCard[]; earlier: number };
  moved: ReadonlySet<string>;
  lit: ReadonlySet<string> | null;
}): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const cards = merged?.recent ?? column.cards;
  const more = useMoreBelow(
    body,
    [String(expanded), ...cards.map(placed => placed.card.key)].join(' ')
  );
  const hidden = expanded ? 0 : Math.max(0, cards.length - PHONE_CARDS);
  return (
    <section
      aria-label={column.label}
      className="flex flex-col gap-3 md:min-h-0 md:w-0 md:min-w-52 md:flex-1"
    >
      <ColumnHeader
        id={column.id}
        label={column.label}
        subtitle={merged === undefined ? column.blurb : `last ${MERGED_DAYS.toString()} days`}
        tone={column.tone}
        count={column.pending ? null : cards.length}
        chips={merged === undefined && !column.pending ? columnChips(column.cards) : []}
      />
      <div className="relative flex flex-col md:min-h-0 md:flex-1">
        <div
          ref={body}
          data-column-body={column.id}
          className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto"
        >
          {cards.length > 0 ? null : column.pending ? (
            // Not known yet: rule 6's loading shape, never an empty state that may be false.
            <CardSkeletons />
          ) : (
            <EmptyColumn sentence={emptySentence(column.label, filtered, merged?.earlier ?? 0)} />
          )}
          {cards.map(({ card }, index) => {
            const props = {
              projectId,
              card,
              moved: moved.has(card.key),
              dimmed: lit !== null && !lit.has(card.key),
              accent: toneColor(column.tone),
            };
            // Past the first few on a phone until "show all"; from md every card shows.
            const folded = !expanded && index >= PHONE_CARDS ? 'max-md:hidden' : '';
            return (
              <div key={card.key} className={folded}>
                {card.pill === 'landed' ? <MergedCard {...props} /> : <BoardCard {...props} />}
              </div>
            );
          })}
          {hidden === 0 ? null : (
            <button
              type="button"
              onClick={() => {
                setExpanded(true);
              }}
              className="self-start rounded px-2 py-1 text-console-13 text-accent-bright hover:underline md:hidden"
            >
              show all {cards.length}
            </button>
          )}
          {merged === undefined || merged.earlier === 0 ? null : (
            <EarlierLink earlier={merged.earlier} />
          )}
        </div>
        {more ? (
          <span
            aria-hidden="true"
            data-fade="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-8 bg-linear-to-b from-transparent to-background md:block"
          />
        ) : null}
      </div>
    </section>
  );
}

/** "N earlier · show all": the Table filtered to every merged item. */
function EarlierLink({ earlier }: { earlier: number }): ReactElement {
  const [params] = useSearchParams();
  return (
    <Link
      to={{ search: earlierSearch(params) }}
      className="self-start px-1 text-console-13 text-text-secondary hover:text-text-primary hover:underline"
    >
      {earlier} earlier · show all
    </Link>
  );
}

/** Rule 6's loading state for a column whose cards wait on a merge answer: two card shapes. */
function CardSkeletons(): ReactElement {
  return (
    <div
      data-skeleton="true"
      aria-label="Checking which changes merged"
      className="flex flex-col gap-3"
    >
      {[0, 1].map(index => (
        <div
          key={index}
          className="flex h-28 shrink-0 flex-col gap-2 rounded-console-12 bg-surface-elevated p-3 motion-safe:animate-pulse"
        >
          <span className="h-3 w-2/5 rounded bg-surface-hover" />
          <span className="h-3 w-3/5 rounded bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

/**
 * Why a column shows no card, so the sentence is true: the cards it is given may be narrowed
 * by a filter or, for Merged, by the 7-day window, and only then is the column itself empty.
 */
export function emptySentence(label: string, filtered: boolean, earlier: number): string {
  // Older merges first: under a filter they are matches, listed by "N earlier" below.
  if (earlier > 0)
    return filtered ? 'No match merged in the last 7 days' : 'Nothing merged in the last 7 days';
  if (filtered) return 'No card here matches the filter';
  return `Nothing in ${label} now`;
}

/** Rule 9's empty-column placeholder, holding rule 6's empty state. */
function EmptyColumn({ sentence }: { sentence: string }): ReactElement {
  return (
    <div className="flex h-24 shrink-0 flex-col items-center justify-center gap-2 rounded-console-12 border border-dashed border-border px-3 text-center">
      <Inbox aria-hidden="true" className="size-5 text-text-tertiary" />
      <p className="text-console-14 text-text-secondary">{sentence}</p>
    </div>
  );
}
