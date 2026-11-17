/**
 * Discover the metric views packs declare in `<pack>/.shared/metric-views.json`.
 *
 * Views are display only: nothing here affects a workflow, script or run. They are read
 * from every place a pack lives, with the scope precedence `readPackDeclarations` owns.
 */
import { readPackDeclarations } from './pack-declarations';
import { PACK_SHARED_DIRECTORY } from './packaged-workflow';
import {
  METRIC_VIEWS_FILE,
  metricViewsFileSchema,
  type MetricViewsListing,
} from './schemas/metric-view';
import type { WorkflowSource } from './schemas';
import { liveSourceRoots } from './workflow-source';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

type Listed = MetricViewsListing['packs'][number] | MetricViewsListing['errors'][number];

const DECLARATION_PATH = `${PACK_SHARED_DIRECTORY}/${METRIC_VIEWS_FILE}`;

/**
 * Every pack's declaration under `roots`. A declaration or scope root that cannot be read,
 * or a declaration that does not validate, is listed under `errors`; one broken pack never
 * hides the others.
 */
export async function discoverMetricViews(
  roots: LiveWorkflowSourceRoots = liveSourceRoots(null)
): Promise<MetricViewsListing> {
  const listing: MetricViewsListing = { packs: [], errors: [] };
  for (const read of await readPackDeclarations(roots, DECLARATION_PATH)) {
    const listed =
      'error' in read
        ? { pack: read.pack, source: read.source, error: read.error }
        : parseDeclaration(read.pack, read.source, read.content);
    if ('error' in listed) listing.errors.push(listed);
    else listing.packs.push(listed);
  }
  return listing;
}

function parseDeclaration(pack: string, source: WorkflowSource, content: string): Listed {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    return { pack, source, error: `${DECLARATION_PATH} is not JSON: ${(error as Error).message}` };
  }
  const parsed = metricViewsFileSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    return { pack, source, error: `${DECLARATION_PATH} is invalid: ${issues.join('; ')}` };
  }
  return { pack, source, names: parsed.data.names ?? {}, cards: parsed.data.cards };
}
