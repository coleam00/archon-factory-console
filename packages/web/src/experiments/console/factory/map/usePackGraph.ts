import { getPackGraph, type PackGraph } from '../../skills/packs';
import { useEntity, type EntityView } from '../../store/cache';
import { K } from '../../store/keys';

/**
 * The pack's stage graph for this project's install, read when a page opens it: trigger files
 * change when the operator installs or removes one, not as runs move, so no stream refreshes it.
 */
export function usePackGraph(projectId: string, packKey: string): EntityView<PackGraph> {
  return useEntity(K.packGraph(projectId, packKey), () =>
    getPackGraph({ pack: packKey, codebaseId: projectId })
  );
}
