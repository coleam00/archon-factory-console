import { useState, type ReactElement } from 'react';
import type { ListedView } from '../lib/overview-nav';

/**
 * Every view of the overview with its card count, the open one marked, indented under the view
 * that opens it. It folds away to give the map the width.
 */
export function OverviewSidebar({
  views,
  current,
  onOpen,
}: {
  views: readonly ListedView[];
  current: string;
  onOpen: (view: string) => void;
}): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <aside aria-label="Views" className={`flex shrink-0 flex-col gap-2 ${open ? 'md:w-48' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Hide the views' : 'Show the views'}
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 self-start rounded px-1.5 py-0.5 text-console-12 font-medium uppercase tracking-wider text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
      >
        <span aria-hidden="true">☰</span>
        {open ? 'Views' : null}
      </button>
      {open ? (
        <ul className="flex flex-col gap-0.5">
          {views.map(view => (
            <li key={view.id}>
              <button
                type="button"
                aria-current={view.id === current ? 'page' : undefined}
                onClick={() => onOpen(view.id)}
                style={{ paddingLeft: `${(0.5 + view.depth * 0.875).toString()}rem` }}
                className={`flex w-full items-center justify-between gap-2 rounded py-1.5 pr-2 text-left text-console-13 transition-colors ${
                  view.id === current
                    ? 'bg-surface-elevated text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <span className="truncate">{view.label}</span>
                <span
                  aria-label={`${view.cards.toString()} cards`}
                  className="rounded-full bg-surface-inset px-1.5 text-console-11 text-text-tertiary"
                >
                  {view.cards}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
