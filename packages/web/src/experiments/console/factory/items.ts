import * as skill from '../skills';
import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import type { FactoryItem } from './lib/board';

/**
 * Every one of a project's items with its progress, newest activity first: all pages of the
 * items read, so a count drawn from it is never one page's. The dashboard SSE invalidates the
 * key on every run and step change, which keeps every view of it live.
 */
export function useFactoryItems(projectId: string): EntityView<FactoryItem[]> {
  return useEntity<FactoryItem[]>(K.factoryItems(projectId), () => readAllItems(projectId));
}

async function readAllItems(codebaseId: string): Promise<FactoryItem[]> {
  const items: FactoryItem[] = [];
  let after: string | undefined;
  do {
    // 100 is the route's largest page.
    const page = await skill.listFactoryItems({ codebaseId, limit: 100, after });
    items.push(...page.items);
    after = page.next ?? undefined;
  } while (after !== undefined);
  return items;
}
