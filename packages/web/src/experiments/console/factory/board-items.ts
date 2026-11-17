import * as skill from '../skills';
import type { FactoryItemsPage } from '../skills/factory';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import type { FactoryItem } from './lib/board';

/** The most the items route returns in one page. */
const PAGE_LIMIT = 100;

type ListPage = typeof skill.listFactoryItems;

/**
 * Every item of the project, following `next` to the last page: a board that stopped at
 * the first page would leave items out of its columns and counts without saying so.
 */
export async function readAllFactoryItems(
  projectId: string,
  list: ListPage = skill.listFactoryItems
): Promise<FactoryItem[]> {
  const items: FactoryItem[] = [];
  let after: string | null = null;
  do {
    const page: FactoryItemsPage = await list({
      codebaseId: projectId,
      limit: PAGE_LIMIT,
      ...(after === null ? {} : { after }),
    });
    items.push(...page.items);
    after = page.next;
  } while (after !== null);
  return items;
}

/**
 * The board's items, kept live: the dashboard SSE invalidates `factory-items` when a run
 * starts, changes step or ends, and the attention stream when an ask opens or closes.
 */
export function useFactoryBoardItems(projectId: string): EntityView<FactoryItem[]> {
  return useEntity(K.factoryItems(projectId), () => readAllFactoryItems(projectId));
}
