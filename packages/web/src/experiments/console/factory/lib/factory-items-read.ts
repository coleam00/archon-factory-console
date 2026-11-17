import { getFactoryProgress, type FactoryItem } from '../../skills/factory';
import { listItemWindow, type ItemRead, type ItemWindow } from '../../skills/items';
import { deadlineOf, FACTORY_READ_DEADLINE_MS, type WithinDeadline } from './deadline';

/**
 * A window start before any run, so every item with a run shows. The window lists an item
 * once one of its own runs started in it, so an item whose only start is still queued shows
 * from its first run on.
 */
const EVERY_ITEM_SINCE = '1970-01-01T00:00:00Z';
/** The most items one window page holds (`ITEM_WINDOW_MAX_LIMIT` on the server). */
const PAGE_LIMIT = 100;

export interface FactoryItemsReads {
  listWindow: typeof listItemWindow;
  getProgress: typeof getFactoryProgress;
}

const SKILLS: FactoryItemsReads = { listWindow: listItemWindow, getProgress: getFactoryProgress };

/** An item's latest activity: the latest of its runs' end, or start while one runs. */
function activityOf(item: ItemRead): number {
  return Math.max(0, ...item.runs.map(run => Date.parse(run.completedAt ?? run.startedAt)));
}

/**
 * Every item of one project, newest activity first, ties by item id: the value
 * `K.factoryItems(projectId)` holds for every Factory page. It walks the engine's items
 * window page by page (the cursor carries the window), and joins each page with the
 * progress the board needs from `GET /api/factory/progress`. The window pages by item id,
 * and the board keeps input order within a column, so the order is set here. A failed page
 * or progress read fails the whole read: a partial list would drop a running item without
 * a sign. Each request has its own deadline, not the walk: a large project's walk is many
 * requests, each quick.
 */
export async function readEveryFactoryItem(
  codebaseId: string,
  reads: FactoryItemsReads = SKILLS,
  within: WithinDeadline = deadlineOf(FACTORY_READ_DEADLINE_MS)
): Promise<FactoryItem[]> {
  const items: FactoryItem[] = [];
  let after: string | null = null;
  do {
    const query: Parameters<FactoryItemsReads['listWindow']>[0] =
      after === null
        ? { project: codebaseId, since: EVERY_ITEM_SINCE, limit: PAGE_LIMIT }
        : { project: codebaseId, after, limit: PAGE_LIMIT };
    const page: ItemWindow = await within(signal => reads.listWindow(query, { signal }));
    if (page.items.length > 0) {
      const keys = page.items.map(read => read.item.key);
      const { progress } = await within(signal =>
        reads.getProgress({ codebaseId, keys }, { signal })
      );
      for (const read of page.items)
        items.push({ ...read, progress: progress[read.item.key] ?? null });
    }
    after = page.next;
  } while (after !== null);
  return items.sort((a, b) => activityOf(b) - activityOf(a) || a.item.id.localeCompare(b.item.id));
}
