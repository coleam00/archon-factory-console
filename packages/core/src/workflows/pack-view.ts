/**
 * The factory view a pack ships (`<pack>/.shared/factory-view.json`, `schemas/factory-view.ts`)
 * for the project at `cwd`, reconciled with the pack's graph (`reconcileFactoryView`): an entry
 * naming what the graph lacks is left out of the view served, with a warning. It is read
 * through `readPackDeclarations` from the same copy of the pack the graph was read from.
 * `GET /api/packs/{pack}/view` serves it.
 */
import { FACTORY_VIEW_PATH, reconcileFactoryView } from '@archon/workflows/factory-view-check';
import { readPackDeclarations } from '@archon/workflows/pack-declarations';
import {
  factoryViewSchema,
  type FactoryView,
  type FactoryViewProblem,
} from '@archon/workflows/schemas/factory-view';
import { installedPackKey, liveSourceRoots } from '@archon/workflows/workflow-source';
import type { PackGraph } from '@archon/workflows/pack-graph';
import { readPackGraph } from './pack-graph';

export interface PackViewRead {
  /** The file read, or null when the pack ships none. */
  path: string | null;
  /**
   * The view with every entry naming what the graph lacks left out, or null when there is no
   * file or it does not read or validate.
   */
  view: FactoryView | null;
  problems: FactoryViewProblem[];
}

/** A declaration's pack as a pack key: `owner/name` of an installed pack is `owner.name`. */
function declarationKey(pack: string): string {
  const slash = pack.indexOf('/');
  return slash === -1 ? pack : installedPackKey(pack.slice(0, slash), pack.slice(slash + 1));
}

const fileError = (message: string): FactoryViewProblem => ({
  severity: 'error',
  path: [],
  message,
});

export async function readPackView(
  cwd: string,
  packKey: string,
  deps: Parameters<typeof readPackGraph>[2],
  options: { workflowSource?: string } = {}
): Promise<PackViewRead> {
  return packViewOf(await readPackGraph(cwd, packKey, deps, options), cwd, options);
}

/**
 * The view file of the pack `graph` was read for, from the same copy, checked against that
 * graph. A caller that has the graph already (the server, which shares one graph read between
 * the graph and view routes) checks the view without reading the graph again.
 */
export async function packViewOf(
  graph: PackGraph,
  cwd: string,
  options: { workflowSource?: string } = {}
): Promise<PackViewRead> {
  const loaded = graph.loaded[0];
  const reads = await readPackDeclarations(
    liveSourceRoots(options.workflowSource ?? cwd),
    FACTORY_VIEW_PATH
  );
  const read = reads.find(
    entry =>
      loaded !== undefined &&
      entry.source === loaded.source &&
      declarationKey(entry.pack) === loaded.key
  );
  if (read === undefined) return { path: null, view: null, problems: [] };
  if ('error' in read)
    return { path: read.path, view: null, problems: [fileError(`cannot be read: ${read.error}`)] };
  let json: unknown;
  try {
    json = JSON.parse(read.content);
  } catch (error) {
    return {
      path: read.path,
      view: null,
      problems: [fileError(`is not JSON: ${(error as Error).message}`)],
    };
  }
  const parsed = factoryViewSchema.safeParse(json);
  if (!parsed.success)
    return {
      path: read.path,
      view: null,
      problems: parsed.error.issues.map(issue => ({
        severity: 'error',
        path: issue.path.map(key => (typeof key === 'number' ? key : String(key))),
        message: issue.message,
      })),
    };
  const reconciled = reconcileFactoryView(parsed.data, graph);
  return { path: read.path, view: reconciled.view, problems: reconciled.problems };
}
