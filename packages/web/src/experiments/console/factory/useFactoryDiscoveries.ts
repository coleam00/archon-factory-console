import { getFactoryDiscoveries } from './api';
import type { FactoryDiscoveries } from './api';
import type { EntityView } from '../store/cache';
import { FK } from './keys';
import { useFactoryRead } from './useFactoryRead';

/**
 * What the project's discoveries drains decided: the one reader of `FK.factoryDiscoveries`,
 * for the board's "Found by the factory" panel and the Overview's tile. Mount it only where
 * the view declares `discoveries`; the server answers 404 otherwise.
 */
export function useFactoryDiscoveries(projectId: string): EntityView<FactoryDiscoveries> {
  return useFactoryRead(FK.factoryDiscoveries(projectId), within =>
    within(signal => getFactoryDiscoveries({ codebaseId: projectId }, { signal }))
  );
}
