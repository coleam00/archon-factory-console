import { useEffect, useRef, useState, type ReactElement, type RefObject } from 'react';
import { Link } from 'react-router';
import { BoardCard } from './BoardCard';
import { hiddenColumnsHint, itemPath, type BoardModel } from './lib/board';

/**
 * The columns whose header shows inside the scroller. Every column counts as shown until
 * the observer reports, and where there is none (a server render), so no hint flashes.
 */
function useShownColumns(
  scroller: RefObject<HTMLDivElement | null>,
  stages: readonly string[]
): ReadonlySet<string> {
  const [shown, setShown] = useState<ReadonlySet<string>>(() => new Set(stages));
  const key = stages.join('\n');
  useEffect(() => {
    const root = scroller.current;
    if (root === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      entries => {
        setShown(current => {
          const next = new Set(current);
          for (const entry of entries) {
            const stage = (entry.target as HTMLElement).dataset.stage ?? '';
            if (entry.isIntersecting) next.add(stage);
            else next.delete(stage);
          }
          return next;
        });
      },
      { root, threshold: 0.9 }
    );
    for (const header of root.querySelectorAll('[data-stage]')) observer.observe(header);
    return (): void => {
      observer.disconnect();
    };
  }, [scroller, key]);
  return shown;
}

/**
 * Pipeline view: one column per declared stage, left to right (top to bottom on a phone),
 * then the folded endings.
 */
export function BoardPipeline({
  projectId,
  model,
  moved,
}: {
  projectId: string;
  model: BoardModel;
  moved: ReadonlySet<string>;
}): ReactElement {
  const scroller = useRef<HTMLDivElement>(null);
  const shown = useShownColumns(
    scroller,
    model.columns.map(column => column.stage)
  );
  const hint = hiddenColumnsHint(model.columns, shown);
  return (
    <div className="flex flex-col gap-2">
      {hint === null ? null : (
        // Only where the columns sit side by side: on a phone they stack and none is hidden.
        <p className="hidden text-console-11 text-text-tertiary md:block" aria-live="polite">
          {hint} →
        </p>
      )}
      {/* A phone stacks the columns, each at full width; from md they sit side by side and
          the row scrolls sideways when they do not fit. */}
      <div
        ref={scroller}
        className="flex flex-col gap-4 pb-2 md:flex-row md:gap-2 md:overflow-x-auto"
      >
        {model.columns.map(column => (
          <section
            key={column.stage}
            aria-label={column.label}
            className="flex flex-col gap-2 md:w-0 md:min-w-36 md:flex-1"
          >
            <h3
              data-stage={column.stage}
              className="flex items-baseline justify-between gap-2 border-b border-border pb-1.5 text-console-11 font-medium uppercase tracking-wider text-text-tertiary"
            >
              <span className="truncate">{column.label}</span>
              <span className="tabular-nums">{column.cards.length}</span>
            </h3>
            {column.cards.map(({ card }) => (
              <BoardCard
                key={card.key}
                projectId={projectId}
                card={card}
                moved={moved.has(card.key)}
              />
            ))}
          </section>
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
    <div className="flex flex-col gap-1.5">
      {ended.map(group => (
        <details
          key={group.label}
          className="rounded border border-border bg-surface px-3 py-2 text-console-12"
        >
          <summary className="cursor-pointer text-text-secondary">
            {group.cards.length} {group.label.toLowerCase()}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {group.cards.map(({ card }) => (
              <li key={card.key} className="flex gap-2">
                <Link
                  to={itemPath(projectId, card.key)}
                  className="font-mono text-console-11 text-accent-bright hover:underline"
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
