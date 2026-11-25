/**
 * An item's parts, for where it stands (`itemStanding`): the items an active `part_of` link
 * joins to it, each with whether it is done.
 */
import type { ItemLinkRead } from './schemas/item-link';
import type { WorkflowItem } from './schemas/workflow-run';
import type { IWorkflowStore } from './store';

/**
 * A part is done when its change merged, else when `placedDone` says it stands `done`;
 * `inside` is `visiting` with the item, for the part's own parts. A part met again inside its
 * own parts is not done, so a cycle of links ends. An unreadable link is no part; the item
 * read reports it.
 */
export async function readParts(
  store: Pick<IWorkflowStore, 'getItemMerge'>,
  item: WorkflowItem,
  links: readonly ItemLinkRead[],
  visiting: ReadonlySet<string>,
  placedDone: (part: WorkflowItem, inside: ReadonlySet<string>) => Promise<boolean>
): Promise<{ done: boolean }[]> {
  const inside = new Set([...visiting, item.id]);
  const parts: { done: boolean }[] = [];
  for (const link of links) {
    if ('type' in link || link.kind !== 'part_of' || link.to.id !== item.id) continue;
    if (link.ended !== null) continue;
    // A merge row that does not read still says the change merged.
    if ((await store.getItemMerge(link.from.id)) !== null) parts.push({ done: true });
    else parts.push({ done: !inside.has(link.from.id) && (await placedDone(link.from, inside)) });
  }
  return parts;
}
