/**
 * The starts an item read shows beside its runs, read for a whole page of items at once: the
 * install hold, the run limit, and each item's held, queued and skipped starts. Also the
 * receipts the item's runs started from, read in one call per item.
 */
import {
  type InstallHold,
  type QueuedItemStart,
  readResourceStartReceiptId,
} from './schemas/resource-start';
import type { RunLimitState } from './schemas/run-limit';
import type { WorkflowRun } from './schemas/workflow-run';
import type { SkippedItemStart, StartReceiptSource } from './resource-start-store';
import type { ItemHeldStart, ItemReadSource } from './item-read';

/** The install hold and one item's held, queued and skipped starts. */
export interface ItemStarts {
  hold: InstallHold | null;
  held: ItemHeldStart[];
  runLimit: RunLimitState | null;
  waiting: readonly QueuedItemStart[];
  skipped: readonly SkippedItemStart[];
}

/**
 * Read the starts of the items `ids` names, and answer each item's from them. The hold,
 * queued and skipped starts are read once for the whole page.
 */
export async function readItemStarts(
  source: ItemReadSource,
  ids: readonly string[]
): Promise<(id: string) => ItemStarts> {
  // Held starts first, then queued starts, then every item's runs, the order a start moves
  // through: one that moves on between two reads shows twice, never in neither. An admitted
  // start shows in both queued and runs (its run id is its request id) and is listed once as
  // a run. Held starts are read per item: they wait for the install hold's lift or for
  // their host's next drain, so they are read whether or not a hold is set.
  const hold = await source.store.getInstallHold();
  const held = new Map<string, ItemHeldStart[]>();
  for (const id of ids) held.set(id, await source.store.listHeldItemStarts(id));
  const waiting = await source.store.listQueuedItemStarts(ids);
  const runLimit = await source.store.getRunLimit();
  const skipped = await source.store.listSkippedItemStarts(ids);
  return id => ({
    hold,
    held: held.get(id) ?? [],
    runLimit,
    waiting: waiting.get(id) ?? [],
    skipped: skipped.get(id) ?? [],
  });
}

/**
 * Give the event loop a turn between two items. bun:sqlite answers synchronously, so every
 * store read resolves without leaving the event loop: without a turn between items, a page of
 * item reads holds the server end to end and every other request waits behind it (#58).
 */
export function yieldTurn(): Promise<void> {
  return new Promise<void>(resolve => setImmediate(resolve));
}

/**
 * The receipts the runs started from, by id. The receipt stays the one owner of why a start
 * happened; this only reads it.
 */
export async function runReceipts(
  source: ItemReadSource,
  runs: readonly WorkflowRun[]
): Promise<ReadonlyMap<string, StartReceiptSource>> {
  const ids = runs.flatMap(run => readResourceStartReceiptId(run.metadata) ?? []);
  return ids.length === 0 ? new Map() : source.store.listStartReceiptSources(ids);
}
