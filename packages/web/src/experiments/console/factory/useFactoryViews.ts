import { getFactoryViews } from './api';
import type { FactoryViews } from './api';
import type { EntityView } from '../store/cache';
import { FK } from './keys';
import { useFactoryRead } from './useFactoryRead';

/**
 * The factory views that apply to a project: the one reader of `FK.factoryViews`. The project
 * tabs and every Factory page read it, and the cache runs whichever subscriber's loader comes
 * first, so a second reader with its own loader could start the read without a deadline.
 */
export function useFactoryViews(projectId: string): EntityView<FactoryViews> {
  return useFactoryRead(FK.factoryViews(projectId), within =>
    within(signal => getFactoryViews({ codebaseId: projectId }, { signal }))
  );
}
