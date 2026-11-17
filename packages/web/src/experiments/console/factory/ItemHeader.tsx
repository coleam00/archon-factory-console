import type { ReactElement, ReactNode } from 'react';
import type { FactoryItem } from '../skills/factory';
import { ITEM_STATE_LABEL, type ItemColumn, type ItemState } from './lib/placement';

const PILL_CLASS: Record<ItemState, string> = {
  running: 'bg-[color-mix(in_oklch,var(--running),transparent_80%)] text-[color:var(--running)]',
  'needs-you': 'bg-warning/20 text-warning',
  failed: 'bg-error/15 text-error',
  waiting: 'bg-surface-elevated text-text-secondary',
  landed: 'bg-success/15 text-success',
};

/** The item's key, title, state, column and change. */
export function ItemHeader({
  item,
  state,
  column,
}: {
  item: FactoryItem;
  state: ItemState;
  /** Null when the item's position could not be derived. */
  column: ItemColumn | null;
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-console-12 text-text-secondary">
        <span
          className={`rounded-full px-2 py-0.5 text-console-11 font-semibold ${PILL_CLASS[state]}`}
        >
          {ITEM_STATE_LABEL[state]}
        </span>
        <ColumnWords item={item} column={column} />
        <ChangeLink change={item.progress?.change ?? null} />
      </div>
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

const mergeWords = (merged: Change['merged']): string =>
  merged === true ? 'merged' : merged === false ? 'open' : 'merge state unknown';

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
