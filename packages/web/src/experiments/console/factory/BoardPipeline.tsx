import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Link } from 'react-router';
import { BoardColumn } from './BoardColumn';
import { hiddenColumnsHint, itemPath, type BoardModel } from './lib/board';
import { mergedWindow } from './lib/merged-window';

/**
 * The columns whose header shows inside the scroller. Every column counts as shown until
 * the observer reports, and where there is none (a server render), so no hint flashes.
 */
function useShownColumns(
  scroller: RefObject<HTMLDivElement | null>,
  columns: readonly string[]
): ReadonlySet<string> {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(columns));
  const key = columns.join('\n');
  useEffect(() => {
    const root = scroller.current;
    if (root === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        setShown(current => {
          const next = new Set(current);
          for (const entry of entries) {
            const column = (entry.target as HTMLElement).dataset.column ?? '';
            if (entry.isIntersecting) next.add(column);
            else next.delete(column);
          }
          return next;
        });
      },
      { root, threshold: 0.9 }
    );
    for (const header of root.querySelectorAll('[data-column]')) observer.observe(header);
    return (): void => {
      observer.disconnect();
    };
  }, [scroller, key]);
  return shown;
}

/**
 * Pipeline view: one column per declared column, left to right (top to bottom on a phone),
 * then the folded endings. From md up the row takes the height it is given and each column
 * scrolls on its own; the Merged column lists the recent window (`mergedWindow`).
 */
export function BoardPipeline({
  projectId,
  model,
  moved,
  lit = null,
  now,
  filtered = false,
}: {
  projectId: string;
  model: BoardModel;
  moved: ReadonlySet<string>;
  /** The keys of the work order `?order=` lights; every other card dims. Null when none. */
  lit?: ReadonlySet<string> | null;
  /** The time the Merged column's window counts back from. */
  now: Date;
  /** The filter box or `?show=` narrows the cards this model holds. */
  filtered?: boolean;
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useShownColumns(
    scroller,
    model.columns.map(column => column.id)
  );
  const hint = hiddenColumnsHint(model.columns, shown);
  return (
    // The minimum sits on this box, not the row inside it: what the board draws under it (the
    // Found by the factory panel) then follows the columns and the frame scrolls, rather than
    // the row overflowing a shrunken box and the panel drawing over the cards.
    <div className="flex flex-col gap-3 md:min-h-80 md:flex-1">
      {hint === null ? null : (
        // Only where the columns sit side by side: on a phone they stack and none is hidden.
        <p className="hidden text-console-12 text-text-tertiary md:block" aria-live="polite">
          {hint} →
        </p>
      )}
      {/* A phone stacks the columns, each at full width; from md they sit side by side and
          the row scrolls sideways when they do not fit. */}
      <div
        ref={scroller}
        className="flex flex-col gap-6 md:min-h-0 md:flex-1 md:flex-row md:gap-3 md:overflow-x-auto"
      >
        {model.columns.map(column => (
          <BoardColumn
            key={column.id}
            projectId={projectId}
            column={column}
            merged={column.id === model.landedColumn ? mergedWindow(column.cards, now) : undefined}
            filtered={filtered}
            moved={moved}
            lit={lit}
          />
        ))}
      </div>
      <EndedRows projectId={projectId} ended={model.ended} />
    </div>
  );
}

/** "N closed by triage" and the like: folded, each item linking to its page. */
function EndedRows({
  projectId,
  ended,
}: {
  projectId: string;
  ended: BoardModel['ended'];
}): ReactElement | null {
  if (ended.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {ended.map(group => (
        <details
          key={group.label}
          className="rounded-console-12 border border-border bg-surface px-3 py-2 text-console-13 md:max-w-md"
        >
          <summary className="cursor-pointer text-text-secondary">
            {group.cards.length} {group.label.toLowerCase()}
          </summary>
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {group.cards.map(({ card }) => (
              <li key={card.key} className="flex gap-2">
                <Link
                  to={itemPath(projectId, card.key)}
                  className="font-mono text-console-12 text-accent-bright hover:underline"
                >
                  {card.key}
                </Link>
                <span className="truncate text-text-secondary">{card.title}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
