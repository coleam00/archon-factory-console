import type { ReactElement, ReactNode } from 'react';
import { GitPullRequest } from 'lucide-react';
import { SkeletonLine } from '../components/Skeleton';
import type { FactoryItem } from '../skills/factory';
import { PILL_CLASS, PillBadge } from './BoardCard';
import type { Pill } from './lib/board';
import type { ItemColumn } from './lib/placement';
import { WORK_ORDER_WORDS } from './ItemWorkOrder';
import { NOT_STARTED, orderTitle } from './lib/work-orders';

/** The item's key, title, state, column and change: the same pill its board card shows. */
export function ItemHeader({
  item,
  pill,
  column,
  workOrder = false,
}: {
  item: FactoryItem;
  pill: Pill;
  /** Where `placement.ts` puts the item; null when no declared stage holds it. */
  column: ItemColumn | null;
  /**
   * A work order with no run of its own: it is in no column and has no state or change, so
   * the header says what it is instead, and without a title of its own reads "Work order <key>".
   */
  workOrder?: boolean;
}): ReactElement {
  const title = item.progress?.title ?? (workOrder ? orderTitle(item.item.key) : null);
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-console-13 text-text-tertiary">{item.item.key}</span>
        <h3 className="min-w-0 break-words text-console-17 font-semibold text-text-primary">
          {title ?? item.item.key}
        </h3>
      </div>
      {workOrder ? (
        <p className="text-console-13 text-text-secondary">{WORK_ORDER_WORDS}</p>
      ) : item.runs.length === 0 ? (
        // No run has started it (a member linked before its first run): no state, column or
        // change to show yet.
        <p className="text-console-13 text-text-secondary">{NOT_STARTED}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-console-13 text-text-secondary">
          <PillBadge pill={pill} />
          <ColumnWords item={item} column={column} />
          <ChangeLink change={item.progress?.change ?? null} />
        </div>
      )}
    </header>
  );
}

function ColumnWords({
  item,
  column,
}: {
  item: FactoryItem;
  column: ItemColumn | null;
}): ReactNode {
  if (item.progress === null || column === null) return <span>Position unknown</span>;
  if ('ended' in column) return <span>{column.ended}</span>;
  // A parked item sits in a stage, but says why it rests there; its reason on hover.
  const { parked } = item.progress;
  if (parked !== null)
    return (
      <span data-parked title={parked.why ?? undefined}>
        {parked.label}
      </span>
    );
  return <span>In {column.stage.label}</span>;
}

type Change = NonNullable<NonNullable<FactoryItem['progress']>['change']>;

/** Rule 5's chip for each merge state the host answered. */
function mergeChip(merged: true | false | 'unknown'): { text: string; className: string } {
  if (merged === true) return { text: 'merged', className: PILL_CLASS.landed };
  if (merged === false) return { text: 'open', className: PILL_CLASS.waiting };
  return { text: 'merge state unknown', className: 'text-text-tertiary' };
}

/** Whether the change merged, as a chip; while the host is asked, a skeleton line. */
function MergeState({ merged }: { merged: Change['merged'] }): ReactElement {
  if (merged === 'pending')
    return (
      <span className="inline-flex w-20 items-center" data-merge-state="pending">
        <SkeletonLine />
        <span className="sr-only">checking whether it merged</span>
      </span>
    );
  const chip = mergeChip(merged);
  return (
    <span
      data-merge-state={String(merged)}
      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-console-12 font-medium ${chip.className}`}
    >
      {chip.text}
    </span>
  );
}

/**
 * The pull request as a button-style link ("PR #n" when the URL ends in a number, else the
 * URL), then whether it merged. Unlinked "the change" while the change host has not named the
 * pull request (no URL yet).
 */
function ChangeLink({ change }: { change: Change | null }): ReactNode {
  if (change === null) return <span className="text-text-tertiary">No change yet</span>;
  const number = change.url === null ? undefined : /\/(\d+)\/?$/.exec(change.url)?.[1];
  return (
    <span className="flex items-center gap-2">
      {change.url === null ? (
        <span className="text-text-secondary">the change</span>
      ) : (
        <a
          href={change.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-console-13 font-medium text-text-primary transition-colors duration-150 ease-out hover:border-border-bright hover:bg-surface-elevated"
        >
          <GitPullRequest aria-hidden="true" className="size-4 shrink-0 text-text-tertiary" />
          {number === undefined ? change.url : `PR #${number}`}
        </a>
      )}
      <MergeState merged={change.merged} />
    </span>
  );
}
