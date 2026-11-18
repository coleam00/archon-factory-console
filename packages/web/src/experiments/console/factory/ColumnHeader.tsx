import type { ReactElement } from 'react';
import { GROUPS } from './map/MapLegend';
import { PILL_LABEL, type Pill } from './lib/board';
import type { ColumnTone } from './lib/board-columns';

/** A column's colour (Visual standard, rule 5): its group's, or the merged column's own. */
export function toneColor(tone: ColumnTone): string {
  return tone === 'merged' ? 'var(--success)' : GROUPS[tone].color;
}

/** A state chip: the state's colour as text on its soft background (rule 5). */
const CHIP_CLASS: Record<Exclude<Pill, 'landed'>, string> = {
  running: 'bg-[color:var(--running-soft)] text-[color:var(--running)]',
  'needs-you': 'bg-[color:var(--warning-soft)] text-warning',
  failed: 'bg-[color:var(--error-soft)] text-error',
  waiting: 'bg-surface-inset text-text-tertiary',
};

/**
 * One board column's header (Visual standard, rule 9): a bar in the column's colour, its
 * label, a one-line subtitle, its count, and a chip per state its cards are in. While the
 * count waits on a merge answer, a skeleton bar stands in for it.
 */
export function ColumnHeader({
  id,
  label,
  subtitle,
  tone,
  count,
  chips,
}: {
  id: string;
  label: string;
  subtitle: string;
  tone: ColumnTone;
  /** Null while it is not known. */
  count: number | null;
  chips: readonly { pill: Exclude<Pill, 'landed'>; count: number }[];
}): ReactElement {
  return (
    <header
      data-column={id}
      className="relative flex flex-col gap-2 overflow-hidden rounded-console-12 border border-border bg-surface px-3 pb-3 pt-4"
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-0.75"
        style={{ background: toneColor(tone) }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate text-console-15 font-semibold text-text-primary">{label}</h3>
          <p className="truncate text-console-12 text-text-tertiary">{subtitle}</p>
        </div>
        {count === null ? (
          <span data-count title="Checking which changes merged" className="flex items-center">
            <span
              aria-hidden="true"
              className="h-5.5 w-12 rounded bg-surface-elevated motion-safe:animate-pulse"
            />
            <span className="sr-only">checking</span>
          </span>
        ) : (
          <span data-count className="text-console-22 font-semibold tabular-nums text-text-primary">
            {count}
          </span>
        )}
      </div>
      {chips.length === 0 ? null : (
        <ul aria-label={`${label} by state`} className="flex flex-wrap gap-1">
          {chips.map(chip => (
            <li
              key={chip.pill}
              className={`rounded-full px-2 py-0.5 text-console-12 ${CHIP_CLASS[chip.pill]}`}
            >
              {PILL_LABEL[chip.pill].toLowerCase()} {chip.count}
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
