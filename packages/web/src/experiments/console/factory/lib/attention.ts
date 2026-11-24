import type { components } from '@/lib/api.generated';
import type { ItemAsk } from '../../primitives/run';
import type { FactoryItem } from '../api';

/** One open entry of the engine's attention queue, as an item read lists it among its questions. */
export type QueueEntry = components['schemas']['AttentionQueueItem'];

/** A queue entry a person acts on: everything but a usage limit. */
export type OpenEntry = Exclude<QueueEntry, { kind: 'usage_limit' }>;

/**
 * What needs a person among `entries`, newest first. A `usage_limit` wait is left out: it takes
 * no answer and retries by itself when the limit resets. Entries with no `pausedAt` (a gate
 * records no time) follow every timed one, in the order they came.
 */
export function openEntries(entries: readonly QueueEntry[]): OpenEntry[] {
  const open = entries.filter((entry): entry is OpenEntry => entry.kind !== 'usage_limit');
  const time = (entry: OpenEntry): number =>
    entry.pausedAt === null ? Number.NEGATIVE_INFINITY : Date.parse(entry.pausedAt);
  // Array.prototype.sort is stable, so equal times keep the given order.
  return open.sort((a, b) => {
    const ta = time(a);
    const tb = time(b);
    if (ta === tb) return 0;
    return tb > ta ? 1 : -1;
  });
}

/**
 * What waits on one item: the open entries its read lists among its questions (the read walks
 * the item's whole run tree, so a wait inside a child run is one), and the project's asks
 * (Archon's attention read) that name the item, each once by ref. The board's count, the map's
 * chips and the ask view all read this, so they agree.
 */
export function itemOpenEntries(
  item: Pick<FactoryItem, 'item' | 'questions'>,
  asks: readonly ItemAsk[]
): OpenEntry[] {
  const byRef = new Map<string, QueueEntry>(item.questions.map(entry => [entry.ref, entry]));
  for (const ask of asks) if (ask.item?.id === item.item.id) byRef.set(ask.ref, ask);
  return openEntries([...byRef.values()]);
}

/** An entry answered by its ref through Archon's ask section: an ask no run holds. */
export function isRefAsk(entry: OpenEntry): entry is ItemAsk {
  return entry.kind === 'attention' && entry.run === undefined;
}

/**
 * The factory items waiting on a person with no ask open: their last run completed with an
 * outcome the view declares `awaits` (for example, an item waiting to be shaped again). An item
 * that also has an open question is not among them: its ask is what needs you, counted there.
 * The board's `awaits` pill takes the same items.
 */
export function awaitingItems<T extends Pick<FactoryItem, 'questions' | 'progress'>>(
  items: readonly T[]
): T[] {
  return items.filter(
    item => item.progress?.awaits != null && openEntries(item.questions).length === 0
  );
}

/**
 * How many things in the factory need a person: every item's open entries and the project's
 * asks, each once by ref, and the items waiting on a person with no ask open. The Overview's
 * number reads this.
 */
export function factoryWaitingCount(
  items: readonly Pick<FactoryItem, 'item' | 'questions' | 'progress'>[],
  asks: readonly ItemAsk[]
): number {
  const refs = new Set(asks.map(ask => ask.ref));
  for (const item of items) for (const entry of openEntries(item.questions)) refs.add(entry.ref);
  return refs.size + awaitingItems(items).length;
}

/**
 * What an entry asks, in one line: the wait's own message, or what happened to a paused run the
 * factory cannot answer. The board card's stop line reads this.
 */
export function askQuestion(entry: OpenEntry): string {
  switch (entry.kind) {
    case 'unreadable':
      return 'This paused run could not be read';
    case 'owner_lost':
      return 'A run lost its owner';
    case 'overdue_wait':
      return 'A stage is still waiting past its deadline';
    default:
      return entry.message;
  }
}

/**
 * The option an ask's workflow declares as recommended, in the ask's own words: the label of
 * the option `recommendation.option` names, else that id in words. Null when the entry is not
 * an ask with options or declares no recommendation. Read from the ask record, never its text.
 */
export function recommendedLabel(entry: OpenEntry): string | null {
  if (entry.kind !== 'attention' || entry.recommendation === undefined) return null;
  const id = entry.recommendation.option;
  return entry.options.find(option => option.id === id)?.label ?? humaniseId(id);
}

/** The run an entry sits on, if any: the run holding the wait, else the run that asked. */
export function entryRunId(entry: OpenEntry): string | undefined {
  if (entry.kind === 'overdue_wait') return entry.waitingIn.runId;
  if (entry.run !== undefined) return entry.run.id;
  return entry.kind === 'attention' ? entry.askedIn?.runId : undefined;
}

/** A workflow's own name, without the pack it came from (`pack:name`). */
export function shortWorkflow(workflow: string): string {
  const colon = workflow.lastIndexOf(':');
  return colon < 0 ? workflow : workflow.slice(colon + 1);
}

/** An id in words: separators to spaces, the first letter capitalised. */
export function humaniseId(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
