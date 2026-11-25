/**
 * The board's last column: the pack's items whose change merged in the last `MERGED_DAYS`
 * local days, newest first (v1's Merged column). Earlier merges are not lost: the Table lists
 * them, and the column links there.
 */
import type { ReactElement } from 'react';
import { Link } from 'react-router';
import type { ItemRead } from '../skills/items';
import { CardList } from '../routes/board/ItemCard';
import { MERGED_DAYS } from './lib/board-numbers';
import { boardViewSearch } from './BoardToolbar';

export function MergedColumn({
  projectId,
  recent,
  earlier,
  counted,
  lit,
}: {
  projectId: string;
  recent: ItemRead[];
  /** How many merged before the window. */
  earlier: number;
  /** Every item is read; until then the column has nothing to count. */
  counted: boolean;
  lit: ReadonlySet<string> | null;
}): ReactElement {
  return (
    <div data-merged className="md:w-64 md:shrink-0">
      <h3 className="flex items-baseline justify-between gap-2 border-b border-border pb-1 text-console-12 font-semibold text-text-secondary">
        <span>Merged</span>
        {counted ? (
          <span data-merged-count className="text-text-tertiary">
            {recent.length}
          </span>
        ) : (
          <span
            title="Reading"
            className="inline-block h-3 w-6 rounded bg-surface-elevated motion-safe:animate-pulse"
          />
        )}
      </h3>
      <p className="mt-1 text-console-11 text-text-tertiary">last {MERGED_DAYS} days</p>
      {counted ? null : (
        <div className="mt-2 h-24 rounded-console-12 bg-surface-elevated motion-safe:animate-pulse" />
      )}
      {recent.length === 0 ? null : (
        <CardList
          reads={recent}
          projectId={projectId}
          lit={lit}
          className="mt-2 flex flex-col gap-2"
        />
      )}
      {earlier === 0 ? null : (
        <Link
          data-merged-earlier
          to={{ search: boardViewSearch('table', { earlier: true }) }}
          className="mt-2 inline-block text-console-13 text-accent motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out hover:text-text-primary"
        >
          {earlier} earlier: see Table
        </Link>
      )}
    </div>
  );
}
