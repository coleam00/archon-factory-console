import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import { readEveryFactoryItem } from './lib/factory-items-read';
import type { FactoryItem } from '../skills/factory';

/**
 * Every item of the project with its progress, for every Factory page. The dashboard SSE
 * invalidates `factory-items` when a run starts, changes step or ends, and the attention
 * stream when an ask opens or closes.
 */
export function useFactoryItems(projectId: string): EntityView<FactoryItem[]> {
  return useEntity(K.factoryItems(projectId), () => readEveryFactoryItem(projectId));
}
