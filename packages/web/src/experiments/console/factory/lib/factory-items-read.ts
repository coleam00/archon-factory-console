import {
  getFactoryViews,
  getForgeSubjects,
  getItem,
  getRunRecords,
  listItemWindow,
  type FactoryItem,
  type ItemRead,
  type ItemWindow,
} from '../api';
import { HttpError } from '../../lib/http';
import { get } from '../../store/cache';
import { FK } from '../keys';
import type { WithinDeadline } from './deadline';
import { deriveItems, type DeriveReads } from './factory-derive';
import type { ChangeLookup } from './item-progress';
import { currentView, type FactoryViewListed } from './views';
import { membershipOf } from './work-orders';

/**
 * A window start before any run, so every item with a run shows. The window lists an item
 * once one of its own runs started in it, so an item whose only start is still queued shows
 * from its first run on.
 */
const EVERY_ITEM_SINCE = '1970-01-01T00:00:00Z';
/** The most items one window page holds (`ITEM_WINDOW_MAX_LIMIT` on the server). */
export const PAGE_LIMIT = 100;

export interface FactoryItemsReads extends DeriveReads {
  listWindow: typeof listItemWindow;
  getItem: typeof getItem;
  /** The view the project's Factory tab draws; undefined when none applies. */
  view: (codebaseId: string, within: WithinDeadline) => Promise<FactoryViewListed | undefined>;
}

/** The view the Factory pages already read, else read here. */
async function projectView(
  codebaseId: string,
  within: WithinDeadline
): Promise<FactoryViewListed | undefined> {
  const cached = get(FK.factoryViews(codebaseId)) as Parameters<typeof currentView>[0];
  if (cached !== undefined) return currentView(cached);
  return currentView(await within(signal => getFactoryViews({ codebaseId }, { signal })));
}

/** The reads the walk goes through in the console. */
export const FACTORY_ITEMS_READS: FactoryItemsReads = {
  listWindow: listItemWindow,
  getItem,
  getRunRecords,
  getForgeSubjects,
  view: projectView,
};

/** An item's latest activity: the latest of its runs' end, or start while one runs. */
function activityOf(item: ItemRead): number {
  return Math.max(0, ...item.runs.map(run => Date.parse(run.completedAt ?? run.startedAt)));
}

/**
 * Every non-empty page of a project's items window, in order: the window from before any
 * run, paged by its cursor. Each request has its own deadline.
 */
async function* windowPages(
  codebaseId: string,
  listWindow: FactoryItemsReads['listWindow'],
  within: WithinDeadline
): AsyncGenerator<ItemRead[]> {
  let after: string | null = null;
  do {
    const query: Parameters<FactoryItemsReads['listWindow']>[0] =
      after === null
        ? { project: codebaseId, since: EVERY_ITEM_SINCE, limit: PAGE_LIMIT }
        : { project: codebaseId, after, limit: PAGE_LIMIT };
    const page: ItemWindow = await within(signal => listWindow(query, { signal }));
    if (page.items.length > 0) yield page.items;
    after = page.next;
  } while (after !== null);
}

/** What `FK.factoryItems(projectId)` holds for every Factory page. */
export interface FactoryItemsRead {
  /** Every item with a run, newest activity first, ties by item id. */
  items: FactoryItem[];
  /**
   * For each item read (every item in `items`, and every work order an item names that
   * `items` lacks), the keys of the items with an active `part_of` link to it. A named order
   * absent here has no item row in the project.
   */
  members: Record<string, string[]>;
  /** Each item's change lookup, by key, for the merge watch to ask about again. */
  lookups: Record<string, NonNullable<ChangeLookup>>;
  /** Whether the forge was still being asked about an issue's title: read again shortly. */
  titlesPending: boolean;
}

/** The keys of the items with an active `part_of` link to `item`, in recording order. */
export function memberKeys(item: ItemRead): string[] {
  return item.links
    .filter(link => link.kind === 'part_of' && link.direction === 'incoming' && link.ended === null)
    .map(link => link.other.key);
}

/**
 * Every item of one project, newest activity first, ties by item id, with the members of
 * every work order they name: the value `FK.factoryItems(projectId)` holds. It walks the
 * engine's items window page by page (the cursor carries the window), then derives every
 * item's progress (`deriveItems`). The window pages by item id, and the board keeps input
 * order within a column, so the order is set here. A failed request fails the whole read: a
 * partial list would drop a running item without a sign. Each request has its own deadline,
 * not the walk. A work order the window lacks (it has no run of its own) is read by key
 * after the walk; one with no item row is left out.
 */
export async function readEveryFactoryItem(
  codebaseId: string,
  reads: FactoryItemsReads,
  within: WithinDeadline
): Promise<FactoryItemsRead> {
  const read: ItemRead[] = [];
  for await (const page of windowPages(codebaseId, reads.listWindow, within)) read.push(...page);
  const view = await reads.view(codebaseId, within);
  const derived =
    view === undefined
      ? {
          items: read.map(item => ({ ...item, progress: null })),
          lookups: new Map(),
          titlesPending: false,
        }
      : await deriveItems(codebaseId, view, read, reads, within);
  const items: FactoryItem[] = derived.items;
  const members: Record<string, string[]> = Object.fromEntries(
    read.map(item => [item.item.key, memberKeys(item)])
  );
  for (const key of namedOrders(items)) {
    if (key in members) continue;
    const order = await within(signal =>
      reads.getItem({ project: codebaseId, key }, { signal })
    ).catch((error: unknown) => {
      if (error instanceof HttpError && error.status === 404) return null;
      throw error;
    });
    if (order !== null) members[key] = memberKeys(order);
  }
  items.sort((a, b) => activityOf(b) - activityOf(a) || a.item.id.localeCompare(b.item.id));
  return {
    items,
    members,
    lookups: Object.fromEntries(derived.lookups),
    titlesPending: derived.titlesPending,
  };
}

/** Every work order an item is part of (`membershipOf`: its link, else its order run's result). */
function namedOrders(items: readonly FactoryItem[]): Set<string> {
  const orders = new Set<string>();
  for (const item of items) {
    const order = membershipOf(item)?.order;
    if (order !== undefined) orders.add(order);
  }
  return orders;
}
