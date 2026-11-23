import { useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { formatDateTime } from '../lib/format';
import { itemPath } from './lib/board';
import { displayItemKey } from './lib/item-key';
import type { SetAside } from './lib/set-aside';

const LIST_ID = 'set-aside-list';

/**
 * The items the board set aside, under the board beside "Found by the factory": one line,
 * "N set aside · show them", opening a short list of each item's key, title, why it was set
 * aside and when its last run ended. The list opens over the board, above the line, and
 * scrolls in its own height, so opening it leaves the columns theirs (as the toolbar's
 * Position unknown row opens over them). Nothing when none is set aside.
 */
export function SetAsideStrip({
  projectId,
  entries,
}: {
  projectId: string;
  entries: readonly SetAside[];
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (entries.length === 0) return null;
  return (
    <section
      aria-labelledby="set-aside-heading"
      className="relative rounded-console-12 border border-border bg-surface px-4 py-2"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 id="set-aside-heading" className="text-console-15 font-semibold text-text-primary">
          <span className="tabular-nums">{entries.length}</span> set aside
        </h2>
        <span aria-hidden className="text-console-13 text-text-secondary">
          ·
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={LIST_ID}
          onClick={() => {
            setOpen(!open);
          }}
          className="text-console-13 text-accent transition-colors duration-150 ease-out hover:text-text-primary"
        >
          {open ? 'hide them' : 'show them'}
        </button>
      </div>
      {open ? (
        <ul
          id={LIST_ID}
          className="absolute inset-x-0 bottom-full z-10 mb-1 flex max-h-72 flex-col gap-2 overflow-y-auto rounded-console-12 border border-border bg-surface-elevated px-4 py-3 shadow-lg"
        >
          {entries.map(entry => (
            <SetAsideRow key={entry.placed.card.key} projectId={projectId} entry={entry} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SetAsideRow({ projectId, entry }: { projectId: string; entry: SetAside }): ReactElement {
  const { card } = entry.placed;
  return (
    <li className="flex min-w-0 flex-col text-console-13">
      <span className="flex min-w-0 items-baseline gap-2">
        <Link
          to={itemPath(projectId, card.key)}
          className="shrink-0 font-mono text-console-12 text-accent-bright hover:underline"
        >
          {displayItemKey(card.key, card.order)}
        </Link>
        <span title={card.title} className="min-w-0 truncate text-text-primary">
          {card.title}
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span title={entry.detail ?? undefined} className="text-text-secondary">
          {entry.why}
        </span>
        {entry.since === null ? null : (
          <span className="whitespace-nowrap text-console-12 text-text-tertiary">
            {formatDateTime(entry.since)}
          </span>
        )}
      </span>
    </li>
  );
}
