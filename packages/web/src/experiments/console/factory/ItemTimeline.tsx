import type { ReactElement, ReactNode } from 'react';
import { History } from 'lucide-react';
import { EmptyNote } from '../components/EmptyNote';
import type { TimelineMerged, TimelineRow } from './lib/timeline';
import { TimelineMergedEntry, TimelineRun } from './TimelineRun';

/**
 * Every run on the item in start order, as a vertical timeline: a dot per run in its stage
 * group's colour on one connecting line, each with its rounds of the declared loop, then a
 * last entry once the change merged.
 */
export function ItemTimeline({
  rows,
  merged,
}: {
  rows: readonly TimelineRow[];
  merged: TimelineMerged | null;
}): ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Timeline</SectionTitle>
      {rows.length === 0 && merged === null ? (
        <EmptyNote icon={History} sentence="No run has worked this item yet." />
      ) : (
        <ol aria-label="Timeline" className="flex flex-col">
          {rows.map((row, index) => (
            <TimelineRun
              key={row.runId}
              row={row}
              last={merged === null && index === rows.length - 1}
            />
          ))}
          {merged === null ? null : <TimelineMergedEntry merged={merged} />}
        </ol>
      )}
    </section>
  );
}

/** An item page section's title, in the Label role (Visual standard, rule 1). */
export function SectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <h4 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
      {children}
    </h4>
  );
}
