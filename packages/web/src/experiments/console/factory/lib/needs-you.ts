import type { FactoryItem } from '../../skills/factory';
import type { AttentionQueueItem } from '../../skills/runs';

/** A queue item a person acts on: everything but a usage limit. */
export type NeedsYouItem = Exclude<AttentionQueueItem, { kind: 'usage_limit' }>;

/** What an `owner_lost` entry says: a run holds its item with no process to carry it on. */
export function ownerLostMessage(item: Extract<NeedsYouItem, { kind: 'owner_lost' }>): string {
  return `The ${item.run.workflow} run lost its owner and still holds ${item.item?.key ?? 'its item'}.`;
}

/**
 * What needs a person in a project's attention queue, newest first. The list and the
 * sub-navigation count both read this, so they cannot disagree.
 *
 * A `usage_limit` wait is left out: it takes no answer (the answer route refuses one) and
 * retries by itself when the limit resets. Items with no `pausedAt` (a gate records no
 * time) follow every timed item, in the order the server sent them.
 */
export function needsYou(items: readonly AttentionQueueItem[]): NeedsYouItem[] {
  const open = items.filter((item): item is NeedsYouItem => item.kind !== 'usage_limit');
  const time = (item: NeedsYouItem): number =>
    item.pausedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(item.pausedAt);
  // Array.prototype.sort is stable, so equal times keep the server's order.
  return open.sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
}

/**
 * What on the live queue waits on one item: an entry the item read lists among its questions
 * (it reads the item's whole run tree, so a wait inside a child run is one), or one the queue
 * itself names the item on. The item page and the map's chips both read this.
 */
export function itemAsks(
  item: Pick<FactoryItem, 'item' | 'questions'>,
  queue: readonly AttentionQueueItem[]
): NeedsYouItem[] {
  const refs = new Set(item.questions.map(question => question.ref));
  return needsYou(queue).filter(entry => refs.has(entry.ref) || entry.item?.id === item.item.id);
}

/**
 * How many Needs-you lines the Overview shows before "show all". At 1440x900 this many
 * one-line rows keep the map's first card row in the first screen (measured in #20).
 */
export const NEEDS_YOU_SHOWN = 4;

/**
 * The Needs-you rows the Overview shows, in the queue's order: the first `limit`, every row
 * the operator opened (so a newer ask arriving cannot unmount a half-typed answer), or all
 * when `showAll`. `hidden` is how many are left out, which the list must say.
 */
export function visibleNeedsYou(
  items: readonly NeedsYouItem[],
  { showAll, opened }: { showAll: boolean; opened: ReadonlySet<string> },
  limit = NEEDS_YOU_SHOWN
): { shown: NeedsYouItem[]; hidden: number } {
  const shown = showAll
    ? [...items]
    : items.filter((item, index) => index < limit || opened.has(item.ref));
  return { shown, hidden: items.length - shown.length };
}
