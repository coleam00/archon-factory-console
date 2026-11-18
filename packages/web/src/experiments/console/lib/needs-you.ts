import type { FactoryItem } from '../skills/factory';
import type { AttentionQueue, AttentionQueueItem } from '../skills/runs';

/** A queue item a person acts on: everything but a usage limit. */
export type NeedsYouItem = Exclude<AttentionQueueItem, { kind: 'usage_limit' }>;

/** What an `owner_lost` entry says: a run holds its item with no process to carry it on. */
export function ownerLostMessage(item: Extract<NeedsYouItem, { kind: 'owner_lost' }>): string {
  return `The ${item.run.workflow} run lost its owner and still holds ${item.item?.key ?? 'its item'}.`;
}

/**
 * What needs a person in a project's attention queue, newest first. Every list and every
 * count of it reads this, so they cannot disagree.
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
 * How many asks and waits need a person: the one count the Needs you tab's badge, the Factory
 * sub-navigation, the Needs you heading and the Overview's number all read, so they never
 * disagree.
 */
export function needsYouCount(queue: Pick<AttentionQueue, 'items'>): number {
  return needsYou(queue.items).length;
}

/**
 * How many items the asks and waits sit on: each item once, and each wait no item holds
 * once by its run (a run with several waits counts once).
 */
export function needsYouItemCount(items: readonly NeedsYouItem[]): number {
  const subjects = new Set(
    items.map(entry =>
      entry.item !== undefined ? `item:${entry.item.id}` : `run:${entry.run?.id ?? entry.ref}`
    )
  );
  return subjects.size;
}

/** The project's Needs you tab; `ask` names one ask (by its ref) for the page to bring forward. */
export function needsYouPath(projectId: string, ask?: string): string {
  const path = `/console/p/${projectId}/needs-you`;
  return ask === undefined ? path : `${path}?ask=${encodeURIComponent(ask)}`;
}

/** The workflow an ask or wait came from: the run that asked, else the run holding the wait. */
export function askWorkflow(entry: NeedsYouItem): string | undefined {
  if (entry.kind === 'attention' && entry.askedIn !== undefined) return entry.askedIn.workflow;
  return entry.run?.workflow;
}

/** The run an ask or wait belongs to: the run holding the wait, else the run that asked. */
export function askRunId(entry: NeedsYouItem): string | undefined {
  if (entry.run !== undefined) return entry.run.id;
  return entry.kind === 'attention' ? entry.askedIn?.runId : undefined;
}
