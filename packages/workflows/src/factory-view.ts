/**
 * Read a pack's factory view file (`<pack>/.shared/factory-view.json`) from the copy of the
 * pack its graph was read from, and check it against that graph (`checkFactoryView`).
 */
import { resolve } from 'node:path';
import { type FactoryViewProblem, checkFactoryView } from './factory-view-check';
import { readPackDeclarations } from './pack-declarations';
import type { PackGraph } from './pack-graph';
import { PACK_SHARED_DIRECTORY } from './packaged-workflow';
import {
  FACTORY_VIEW_FILE,
  type FactoryViewFile,
  factoryViewFileSchema,
} from './schemas/factory-view';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

const RELATIVE_PATH = `${PACK_SHARED_DIRECTORY}/${FACTORY_VIEW_FILE}`;

export interface FactoryViewRead {
  /** The file, or null when the pack ships none or it does not read or validate. */
  view: FactoryViewFile | null;
  /** Where it was read from; null when the pack ships none. */
  path: string | null;
  /** Why it did not read or validate, or what `checkFactoryView` finds wrong with it. */
  problems: FactoryViewProblem[];
}

/**
 * The view file of `graph`'s nearest loaded copy, found among the declarations `roots` reach.
 * `roots` must be the roots the graph was discovered from. A pack folder named directly as the
 * workflow source (not under a scope's `.archon/workflows/`) is not a scope pack-declarations
 * reads, so its file is not found there and the read is `view: null`.
 */
export async function readFactoryView(
  roots: LiveWorkflowSourceRoots,
  graph: PackGraph
): Promise<FactoryViewRead> {
  const copy = graph.loaded[0];
  if (copy === undefined) return { view: null, path: null, problems: [] };
  const reads = await readPackDeclarations(roots, RELATIVE_PATH);
  const read =
    copy.dir === null
      ? reads.find(entry => entry.source === 'bundled' && entry.pack === copy.key)
      : reads.find(
          entry =>
            resolve(entry.path) ===
            resolve(copy.dir ?? '', PACK_SHARED_DIRECTORY, FACTORY_VIEW_FILE)
        );
  if (read === undefined) return { view: null, path: null, problems: [] };
  const fail = (message: string): FactoryViewRead => ({
    view: null,
    path: read.path,
    problems: [{ severity: 'error', path: [], message }],
  });
  if ('error' in read) return fail(`could not be read: ${read.error}`);
  let json: unknown;
  try {
    json = JSON.parse(read.content);
  } catch (error) {
    return fail(`is not JSON: ${(error as Error).message}`);
  }
  const parsed = factoryViewFileSchema.safeParse(json);
  if (!parsed.success)
    return {
      view: null,
      path: read.path,
      problems: parsed.error.issues.map(issue => ({
        severity: 'error',
        path: issue.path.map(key => (typeof key === 'number' ? key : String(key))),
        message: issue.message,
      })),
    };
  return { view: parsed.data, path: read.path, problems: checkFactoryView(parsed.data, graph) };
}
