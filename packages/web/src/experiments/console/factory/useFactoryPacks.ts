import { getFactoryPacks } from './api';
import type { FactoryPacksRead } from './api';
import type { EntityView } from '../store/cache';
import { FK } from './keys';
import { useFactoryRead } from './useFactoryRead';

/**
 * Every pack with a factory overview file: the one reader of `FK.factoryPacks`. The sidebar
 * entry and the pack pages read it, so they agree on which packs have a page.
 */
export function useFactoryPacks(): EntityView<FactoryPacksRead> {
  return useFactoryRead(FK.factoryPacks, within => within(signal => getFactoryPacks({ signal })));
}
