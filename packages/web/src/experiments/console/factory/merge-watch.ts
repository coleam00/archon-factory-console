import { getForgeSubjects, type FactoryItem, type FactoryItemDetail } from './api';
import { get, patch } from '../store/cache';
import { FK } from './keys';
import { deadlineOf, FACTORY_READ_DEADLINE_MS } from './lib/deadline';
import { forgeRead } from './lib/factory-derive';
import type { FactoryItemsRead } from './lib/factory-items-read';
import { changeOf, type ChangeLookup } from './lib/item-progress';
import { awaitingMergeKeys } from './lib/merge-pending';
import type { FactoryChange } from './lib/progress-types';

/**
 * How often the page asks again about changes the forge has not reported merged. A merge on
 * the forge is no run event, so nothing else asks once an item's last run ended. The server
 * keeps a not-merged answer for 60 s, then serves it once more while it refreshes, so a
 * merge shows on the ask after the one that started the refresh: typically 60 to 90 s after
 * it, at worst about 2 min. A shorter interval would mostly re-read the server's cached answer.
 */
export const MERGE_WATCH_MS = 30_000;

export interface MergeWatchDeps {
  getForgeSubjects: typeof getForgeSubjects;
  delayMs: number;
  /** The page's document, for its visibility; `globalThis.document` when absent. */
  doc?: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
}

const DEFAULT_DEPS: MergeWatchDeps = { getForgeSubjects, delayMs: MERGE_WATCH_MS };

interface Watch {
  readers: number;
  deps: MergeWatchDeps;
  timer?: ReturnType<typeof setTimeout>;
  /** Removes the listener a hidden tab waits on. */
  stopWaiting?: () => void;
}

/** One watch per project, however many readers: every Factory page reads the same items. */
const watches = new Map<string, Watch>();

/**
 * Watches the merge state of `FK.factoryItems(projectId)` while the caller holds it: every
 * `deps.delayMs` it asks the forge (`GET /api/forge/subjects`) about the changes of the items
 * whose change is not merged (`awaitingMerge`), only those, and patches the answers into the items, so the
 * board, the Merged column and the Overview's numbers place them from the same value. It
 * asks nothing while the tab is hidden and asks at once when it shows again. Returns the
 * release; the last release stops the watch. The first watcher's `deps` hold for the watch.
 */
export function watchMerges(projectId: string, deps: MergeWatchDeps = DEFAULT_DEPS): () => void {
  let watch = watches.get(projectId);
  if (watch === undefined) {
    watch = { readers: 0, deps };
    watches.set(projectId, watch);
    schedule(projectId, watch);
  }
  const held = watch;
  held.readers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.readers--;
    if (held.readers === 0) stop(projectId, held);
  };
}

/** Whether a watch on `projectId` is held; for tests of the readers that hold it. */
export function mergeWatchHeld(projectId: string): boolean {
  return watches.has(projectId);
}

/** Stops every watch; for tests, so a timer never fires into the next one. */
export function cancelMergeWatches(): void {
  for (const [projectId, watch] of watches) stop(projectId, watch);
}

function live(projectId: string, watch: Watch): boolean {
  return watches.get(projectId) === watch;
}

function stop(projectId: string, watch: Watch): void {
  clearTimeout(watch.timer);
  watch.stopWaiting?.();
  if (live(projectId, watch)) watches.delete(projectId);
}

function schedule(projectId: string, watch: Watch): void {
  watch.timer = setTimeout(() => void tick(projectId, watch), watch.deps.delayMs);
}

/**
 * One ask, then the next one scheduled while the watch lives, an ask with nothing waiting
 * included: the readers' release is what stops it, so a value that stops and starts waiting
 * between two renders never strands the watch.
 */
async function tick(projectId: string, watch: Watch): Promise<void> {
  watch.timer = undefined;
  if (!live(projectId, watch)) return;
  const doc = watch.deps.doc ?? globalThis.document;
  if (doc?.visibilityState === 'hidden') {
    waitUntilVisible(projectId, watch, doc);
    return;
  }
  try {
    await readWaiting(projectId, watch);
  } catch (err) {
    // The board keeps its last read and the next tick asks again; a failed ask changes
    // nothing a person sees, so it is only logged.
    console.warn('[console-factory] merge watch read failed', { projectId, err });
  } finally {
    if (live(projectId, watch)) schedule(projectId, watch);
  }
}

/** Waits for the tab to show, then asks at once: the merge was likely made in another tab. */
function waitUntilVisible(
  projectId: string,
  watch: Watch,
  doc: NonNullable<MergeWatchDeps['doc']>
): void {
  const onChange = (): void => {
    if (doc.visibilityState === 'hidden') return;
    watch.stopWaiting?.();
    void tick(projectId, watch);
  };
  doc.addEventListener('visibilitychange', onChange);
  watch.stopWaiting = () => {
    doc.removeEventListener('visibilitychange', onChange);
    watch.stopWaiting = undefined;
  };
}

/** `item` with its change as `answers` give it; an item with no lookup stays as it was. */
function withChange(
  item: FactoryItem,
  lookup: NonNullable<ChangeLookup> | undefined,
  answers: ReadonlyMap<string, FactoryChange>
): FactoryItem {
  if (lookup === undefined || item.progress === null || !answers.has(lookup.run)) return item;
  return { ...item, progress: { ...item.progress, change: changeOf(item, lookup, answers) } };
}

/**
 * Asks about the waiting items' changes and patches every answer in at once: into the items
 * every Factory page reads, and into each waiting item's own read that is cached (the item
 * page's header), so the two never disagree on a merge. A read that landed meanwhile is
 * newer than this ask, so the answer is dropped for that value.
 */
async function readWaiting(projectId: string, watch: Watch): Promise<void> {
  const key = FK.factoryItems(projectId);
  const before = get(key) as FactoryItemsRead | undefined;
  if (before === undefined) return;
  const keys = awaitingMergeKeys(before.items);
  const lookups = keys.flatMap(itemKey => before.lookups[itemKey] ?? []);
  if (lookups.length === 0) return;
  const details = keys.map(itemKey => {
    const detailKey = FK.factoryItem(projectId, itemKey);
    return { itemKey, detailKey, detail: get(detailKey) as FactoryItemDetail | undefined };
  });
  const { changes } = await forgeRead(
    projectId,
    [],
    lookups,
    { getForgeSubjects: watch.deps.getForgeSubjects },
    deadlineOf(FACTORY_READ_DEADLINE_MS)
  );
  if (!live(projectId, watch)) return;
  if (get(key) === before)
    patch(key, () => ({
      ...before,
      items: before.items.map(item => withChange(item, before.lookups[item.item.key], changes)),
    }));
  for (const { itemKey, detailKey, detail } of details) {
    if (detail === undefined || get(detailKey) !== detail) continue;
    const item = withChange(detail.item, before.lookups[itemKey], changes);
    if (item !== detail.item) patch(detailKey, () => ({ ...detail, item }));
  }
}
