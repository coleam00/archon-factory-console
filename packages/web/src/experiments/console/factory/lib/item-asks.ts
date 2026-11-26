/**
 * The one rule for "this item has open asks" (#243). A board card's Needs you button, its column
 * header's needs-you chip, the Overview's flow and map counts, the stage's "Items here now"
 * lines, the work-order dots and the Table's State sort all read it, so none of them can count
 * needs-you by a rule of its own. It reads the attention list's asks, never the item read's
 * `questions` (a question a run holds is the card's "Its run waits for an answer", not an ask)
 * and never `ItemAsks.itemIds` (which also holds the items a run holds open).
 */
import type { ItemAsks } from '../../components/ItemAsksSection';
import { openAsksOf } from '../../lib/item-key';
import type { ItemAsk, RunsAttention } from '../../primitives/run';
import type { ItemRead } from '../../skills/items';

/**
 * The project's asks as a surface reads them: `reading` until the attention list first answers,
 * `failed` when it could not be read and nothing was read before. Neither is "no asks".
 */
export type AskRead = ItemAsks | 'reading' | 'failed';

/**
 * The asks a page holds, from its attention read. A failed read again keeps the asks it read
 * before (the cache keeps them), so only a read that never answered is `failed`.
 */
export function askReadOf(
  attention: RunsAttention | undefined,
  error: Error | undefined,
  itemAsks: ItemAsks
): AskRead {
  if (attention !== undefined) return itemAsks;
  return error === undefined ? 'reading' : 'failed';
}

/** The item's open asks, counted as the Needs you tab counts the `?item=` its link carries (#225). */
export function itemAsksOf(asks: ItemAsks, read: ItemRead): ItemAsk[] {
  return openAsksOf(asks.asks, asks.answered, [read.item.key]);
}

/** Whether the item has open asks; null while that is not known (no asks given, read or failed). */
export function askedOf(asks: AskRead | null, read: ItemRead): boolean | null {
  return asks === null || typeof asks === 'string' ? null : itemAsksOf(asks, read).length > 0;
}

/** How many of `items` have open asks; null while that is not known. */
export function askedCount(asks: AskRead | null, items: readonly ItemRead[]): number | null {
  return asks === null || typeof asks === 'string'
    ? null
    : items.filter(read => itemAsksOf(asks, read).length > 0).length;
}
