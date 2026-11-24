import type { ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import { askGroupKey, ItemAsksSection } from '../components/ItemAsksSection';
import type { ItemAsk } from '../primitives/run';
import type { FactoryItem } from './api';
import { awaitingItems, isRefAsk, itemOpenEntries, openEntries } from './lib/attention';
import { boardShowSearch } from './lib/board-show';
import { factoryPath } from './lib/views';
import type { FactoryAsks } from './useItemAsks';

/** How many items' asks the Overview shows before "N more" leads to the board. */
const OVERVIEW_ITEMS_SHOWN = 3;

/**
 * The Overview's Needs you: the asks of the newest items that wait on you, in Archon's own ask
 * section, answerable in place; then how many more wait, the items waiting on you with no ask
 * open (`awaitingItems`) among them, linking to the board's "needs you" show. Nothing shows
 * when nothing waits.
 */
export function OverviewAsks({
  projectId,
  items,
  asks,
}: {
  projectId: string;
  items: readonly FactoryItem[] | undefined;
  asks: FactoryAsks;
}): ReactNode {
  const answered = new Set(asks.section.answered.map(record => record.ask.ref));
  const open = projectAsks(items ?? [], asks.asks).filter(ask => !answered.has(ask.ref));
  const awaiting = awaitingItems(items ?? []).length;
  const groups = [...new Set(open.map(askGroupKey))];
  const shownGroups = new Set(groups.slice(0, OVERVIEW_ITEMS_SHOWN));
  const shown = open.filter(ask => shownGroups.has(askGroupKey(ask)));
  if (shown.length === 0 && asks.section.answered.length === 0 && awaiting === 0) return null;
  const more = open.length - shown.length + awaiting;
  return (
    <section aria-label="Needs you" className="flex max-w-3xl flex-col gap-3">
      <h3 className="text-console-12 font-medium uppercase tracking-console-label text-text-tertiary">
        Needs you
      </h3>
      <ItemAsksSection {...asks.section} asks={shown} showProject={false} />
      {more > 0 ? <MoreLink projectId={projectId} more={more} shown={shown.length > 0} /> : null}
    </section>
  );
}

/** The project's asks answered by ref, newest first: every item's, and those Archon's read names, each once. */
function projectAsks(items: readonly FactoryItem[], asks: readonly ItemAsk[]): ItemAsk[] {
  const byRef = new Map<string, ItemAsk>();
  for (const item of items)
    for (const entry of itemOpenEntries(item, asks))
      if (isRefAsk(entry)) byRef.set(entry.ref, entry);
  for (const ask of asks) byRef.set(ask.ref, ask);
  return openEntries([...byRef.values()]).filter(isRefAsk);
}

/**
 * The line to the board's "needs you" show: "N more on the board" under the asks shown, or,
 * with none to show (only items waiting on you with no ask open), how many items wait there.
 */
function MoreLink({
  projectId,
  more,
  shown,
}: {
  projectId: string;
  more: number;
  shown: boolean;
}): ReactElement {
  return (
    <Link
      to={factoryPath(projectId, `/board${boardShowSearch('needs-you')}`)}
      className="self-start text-console-13 text-text-secondary hover:text-text-primary hover:underline"
    >
      {shown
        ? `${more.toString()} more on the board`
        : `${more.toString()} ${more === 1 ? 'item waits' : 'items wait'} for you on the board`}
    </Link>
  );
}
