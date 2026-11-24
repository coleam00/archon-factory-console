/**
 * The reads of a page of items, each against one read of the attention queue and of the
 * page's starts, with a turn of the event loop between two items.
 */
import type { WorkflowItem } from './schemas/workflow-run';
import {
  assembleItemRead,
  type ItemQueueRead,
  type ItemRead,
  type ItemReadSource,
} from './item-read';
import { readItemStarts, yieldTurn } from './item-read-starts';

/**
 * Build the reads of `items`, in their order, against one read of the attention queue, so a
 * reader of many items reads the queue and the items' starts once. A read is null when its
 * item has gone from the store.
 */
export async function assembleItemReads(
  source: ItemReadSource,
  items: readonly WorkflowItem[],
  queue: ItemQueueRead
): Promise<(ItemRead | null)[]> {
  const starts = await readItemStarts(
    source,
    items.map(item => item.id)
  );
  const reads: (ItemRead | null)[] = [];
  for (const item of items) {
    await yieldTurn();
    reads.push(await assembleItemRead(source, item, queue, starts(item.id)));
  }
  return reads;
}
