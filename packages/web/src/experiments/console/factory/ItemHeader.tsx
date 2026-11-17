import type { ReactElement, ReactNode } from 'react';
import type { FactoryItem } from '../skills/factory';
import { PillBadge } from './BoardCard';
import type { FactoryDeclaration, Pill, Placement } from './lib/board';

/** The item's key, title, state, column and change: the same pill its board card shows. */
export function ItemHeader({
  item,
  pill,
  placement,
  view,
}: {
  item: FactoryItem;
  pill: Pill;
  placement: Placement;
  view: FactoryDeclaration;
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
        <PillBadge pill={pill} />
        <ColumnWords item={item} placement={placement} view={view} />
        <ChangeLink change={item.progress?.change ?? null} />
      </div>
    </header>
  );
}

function ColumnWords({
  item,
  placement,
  view,
}: {
  item: FactoryItem;
  placement: Placement;
  view: FactoryDeclaration;
}): ReactNode {
  if (item.progress === null) return <span>Position unknown</span>;
  if (placement.kind === 'ended') return <span>{placement.label}</span>;
  const stage = view.stages.find(candidate => candidate.id === placement.stage);
  return <span>In {stage?.label ?? placement.stage}</span>;
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
