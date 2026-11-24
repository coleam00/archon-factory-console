import { getFactoryPackSettings } from './api';
import type { FactoryPackSettings } from './api';
import type { EntityView } from '../store/cache';
import { FK } from './keys';
import { useFactoryRead } from './useFactoryRead';

/** One pack's declared settings and each project's values: the one reader of `FK.factoryPackSettings`. */
export function useFactoryPackSettings(packKey: string): EntityView<FactoryPackSettings> {
  return useFactoryRead(FK.factoryPackSettings(packKey), within =>
    within(signal => getFactoryPackSettings({ pack: packKey }, { signal }))
  );
}
