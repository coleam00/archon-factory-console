import { useEffect } from 'react';
import type { EntityView } from '../store/cache';
import { K } from '../store/keys';
import { FACTORY_ITEMS_READS, readEveryFactoryItem } from './lib/factory-items-read';
import { anyMergePending } from './lib/merge-pending';
import { scheduleReread } from './merge-reread';
import { useFactoryRead } from './useFactoryRead';
import type { FactoryItem } from '../skills/factory';

/**
 * Every item of the project with its progress, for every Factory page. The dashboard SSE
 * invalidates `factory-items` when a run starts, changes step or ends, and the attention
 * stream when an ask opens or closes. While any item's merge state is `pending` it reads
 * again shortly, a failed read included, until the server has the answer.
 */
export function useFactoryItems(projectId: string): EntityView<FactoryItem[]> {
  const read = useFactoryRead(K.factoryItems(projectId), within =>
    readEveryFactoryItem(projectId, FACTORY_ITEMS_READS, within)
  );
  const { data, error } = read;
  // `error` is a dependency on purpose: a failed re-read keeps the same `data`, and must
  // still schedule the next one.
  useEffect(() => {
    if (data !== undefined && anyMergePending(data)) scheduleReread(K.factoryItems(projectId));
  }, [data, error, projectId]);
  return read;
}
