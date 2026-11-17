import { requestJson } from '../lib/http';
import type { components } from '@/lib/api.generated';

export type PackGraph = components['schemas']['PackGraph'];

/**
 * A pack's stages, outcomes and run-ended arrows in this install, each arrow active (a
 * trigger file launches it) or only declared by the pack: what `archon pack graph` prints.
 */
export async function getPackGraph(opts: {
  /** The pack's folder key, as the factory views listing names it (`packKey`). */
  pack: string;
  codebaseId: string;
}): Promise<PackGraph> {
  return requestJson('/api/packs/{pack}/graph', 'get', {
    params: { pack: opts.pack },
    query: { codebaseId: opts.codebaseId },
  });
}
