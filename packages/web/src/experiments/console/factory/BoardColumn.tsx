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
 * Whether the element has more content below what it shows: its bottom fade shows then. Where
 * there is no `ResizeObserver` (a server render, a test DOM), it follows scrolling only.
 */
function useMoreBelow(ref: RefObject<HTMLElement | null>): boolean {
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
  }, [ref]);
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
  moved,
  lit,
}: {
  projectId: string;
  column: BoardColumnModel;
  /** For the Merged column: its window (`mergedWindow`). Undefined for every other column. */
  merged?: { recent: PlacedCard[]; earlier: number };
  moved: ReadonlySet<string>;
  lit: ReadonlySet<string> | null;
}): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const more = useMoreBelow(body);
  const [expanded, setExpanded] = useState(false);
  const cards = merged?.recent ?? column.cards;
  const hidden = expanded ? 0 : Math.max(0, cards.length - PHONE_CARDS);
  return (
    // At least 200 px, not the Visual standard's 220 (rule 3): beside the 280 px sidebar a
    // 1440 px screen leaves 1100 px, where five 220 px columns and their gaps need 1148 and
    // the board must fit without scrolling sideways (#66). Narrower screens scroll sideways.
    <section
      aria-label={column.label}
      className="flex flex-col gap-3 md:min-h-0 md:w-0 md:min-w-50 md:flex-1"
    >
      <ColumnHeader
        id={column.id}
        label={column.label}
        subtitle={merged === undefined ? column.blurb : `last ${MERGED_DAYS.toString()} days`}
        tone={column.tone}
        count={column.pending ? null : cards.length}
        chips={merged === undefined ? columnChips(column.cards) : []}
      />
      <div className="relative flex flex-col md:min-h-0 md:flex-1">
        <div
          ref={body}
          data-column-body={column.id}
          className="flex flex-col gap-3 md:min-h-0 md:flex-1 md:overflow-y-auto"
        >
          {cards.length === 0 ? <EmptyColumn label={column.label} /> : null}
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

/** Rule 9's empty-column placeholder, holding rule 6's empty state. */
function EmptyColumn({ label }: { label: string }): ReactElement {
  return (
    <div className="flex h-24 shrink-0 flex-col items-center justify-center gap-2 rounded-console-12 border border-dashed border-border px-3 text-center">
      <Inbox aria-hidden="true" className="size-5 text-text-tertiary" />
      <p className="text-console-14 text-text-secondary">Nothing in {label} now</p>
    </div>
  );
}
