import type { ReactElement, ReactNode } from 'react';
import type { FactoryItem } from '../skills/factory';
import { PillBadge } from './BoardCard';
import type { Pill } from './lib/board';
import type { ItemColumn } from './lib/placement';
import { WORK_ORDER_WORDS } from './ItemWorkOrder';

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
   * the header says what it is instead.
   */
  workOrder?: boolean;
}): ReactElement {
  const title = item.progress?.title ?? null;
  return (
    <header className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-console-12 text-text-tertiary">{item.item.key}</span>
        <h3 className="min-w-0 break-words text-base font-medium text-text-primary">
          {title ?? item.item.key}
        </h3>
      </div>
      {workOrder ? (
        <p className="text-console-12 text-text-secondary">{WORK_ORDER_WORDS}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-console-12 text-text-secondary">
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
  return <span>In {column.stage.label}</span>;
}

type Change = NonNullable<NonNullable<FactoryItem['progress']>['change']>;

function mergeWords(merged: Change['merged']): string {
  switch (merged) {
    case true:
      return 'merged';
    case false:
      return 'open';
    case 'pending':
      return 'checking whether it merged';
    case 'unknown':
      return 'merge state unknown';
    default: {
      const unhandled: never = merged;
      return unhandled;
    }
  }
}

/** "PR #n" when the URL ends in a number, else the URL; then whether it merged. */
function ChangeLink({ change }: { change: Change | null }): ReactNode {
  if (change === null) return <span className="text-text-tertiary">No change yet</span>;
  const number = /\/(\d+)\/?$/.exec(change.url)?.[1];
  return (
    <span className="flex items-baseline gap-1.5">
      <a
        href={change.url}
        target="_blank"
        rel="noreferrer"
        className="text-accent-bright hover:underline"
      >
        {number === undefined ? change.url : `PR #${number}`}
      </a>
      <span className="text-text-tertiary">{mergeWords(change.merged)}</span>
    </span>
  );
}
