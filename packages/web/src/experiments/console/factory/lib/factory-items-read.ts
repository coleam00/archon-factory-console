import { listFactoryItems } from '../../skills/factory';
import type { FactoryItem } from './items-on-step';

/**
 * Every item of one project, walking the items read page by page until `next` is null; the
 * value `K.factoryItems(projectId)` holds, for every page that reads it. Paged by the server's
 * default size, so the web keeps no copy of its limit. A failed page fails the whole read:
 * a partial list would drop a running item without a sign.
 */
export async function readEveryFactoryItem(
  codebaseId: string,
  list: typeof listFactoryItems = listFactoryItems
): Promise<FactoryItem[]> {
  const items: FactoryItem[] = [];
  let after: string | null = null;
  do {
    const page = await list({ codebaseId, ...(after === null ? {} : { after }) });
    items.push(...page.items);
    after = page.next;
  } while (after !== null);
  return items;
}
