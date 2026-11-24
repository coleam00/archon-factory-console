import { membershipOf, type MemberSource } from './work-orders';

/** What a strip or an item's records names another item by: its title, and its work order. */
export interface ItemName {
  title: string | null;
  partOf: string | null;
}

/**
 * What the items read says of each item, by key. The engine's item read carries the links, so
 * an item's work order is known without a view; the title needs one.
 */
export function itemNames(items: readonly MemberSource[] | undefined): Map<string, ItemName> {
  return new Map(
    (items ?? []).map(item => [
      item.item.key,
      { title: item.progress?.title ?? null, partOf: membershipOf(item)?.order ?? null },
    ])
  );
}
