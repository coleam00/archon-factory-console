import { useEntity, type EntityView } from '../store/cache';
import { K } from '../store/keys';
import { readEveryFactoryItem } from './lib/factory-items-read';
import type { FactoryItem } from './lib/items-on-step';

/** Every item of the project with its progress; the dashboard stream keeps it live. */
export function useFactoryItems(projectId: string): EntityView<FactoryItem[]> {
  return useEntity(K.factoryItems(projectId), () => readEveryFactoryItem(projectId));
}
