/**
 * Discover factory views (`schemas/factory-view.ts`) for a project, and decide which apply.
 *
 * A project file `.archon/packs/<pack key>.factory-view.json` comes first, so a project may
 * present an installed pack it cannot edit; then `<pack>/.shared/factory-view.json` in every
 * pack the project can run, with the scope precedence metric views use. A file that cannot be
 * read or does not validate is listed under `errors` with its path; it never hides the others.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readPackDeclarations } from './pack-declarations';
import { PACK_SHARED_DIRECTORY } from './packaged-workflow';
import {
  FACTORY_VIEW_FILE,
  FACTORY_VIEW_PROJECT_SUFFIX,
  factoryViewSchema,
  type FactoryViewSource,
  type FactoryViewsListing,
} from './schemas/factory-view';
import { installedPackKey, installedWorkflowName } from './workflow-source/installed-packs';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

type Listed = FactoryViewsListing['views'][number] | FactoryViewsListing['errors'][number];

const DECLARATION_PATH = `${PACK_SHARED_DIRECTORY}/${FACTORY_VIEW_FILE}`;

/** An installed pack's owner and name from its `owner/name`; a folder pack has none. */
function installedIdentity(pack: string): { owner: string; name: string } | undefined {
  const slash = pack.indexOf('/');
  if (slash === -1) return undefined;
  return { owner: pack.slice(0, slash), name: pack.slice(slash + 1) };
}

/** The key a pack's project files are named by, as pack settings use: `owner.name` when installed. */
export function factoryPackKey(pack: string): string {
  const installed = installedIdentity(pack);
  return installed === undefined ? pack : installedPackKey(installed.owner, installed.name);
}

/**
 * The name a run of `workflow` from `pack` records: `owner/name:workflow` for an installed
 * pack, the bare workflow name for a folder pack.
 */
export function factoryRunWorkflowName(pack: string, workflow: string): string {
  const installed = installedIdentity(pack);
  if (installed === undefined) return workflow;
  return installedWorkflowName(installed, workflow);
}

/**
 * Every view and error under `roots`. A project file replaces its pack's own view even when
 * the file is broken, as a higher scope's declaration does for metric views: the project
 * chose how to present the pack, and its error is listed instead of a view it replaced.
 */
export async function discoverFactoryViews(
  roots: LiveWorkflowSourceRoots
): Promise<FactoryViewsListing> {
  const listing: FactoryViewsListing = { views: [], errors: [] };
  const project = roots.project === null ? [] : await projectFiles(roots.project);
  // Pack keys with a project file; a broken file is listed under the key its name gives.
  const presented = new Set<string>();
  for (const listed of project) {
    if ('error' in listed) {
      listing.errors.push(listed);
      presented.add(listed.pack);
    } else {
      listing.views.push(listed);
      presented.add(factoryPackKey(listed.pack));
    }
  }
  for (const read of await readPackDeclarations(roots, DECLARATION_PATH)) {
    const listed =
      'error' in read ? read : parseDeclaration(read.pack, read.source, read.path, read.content);
    if ('error' in listed) listing.errors.push(listed);
    else if (!presented.has(factoryPackKey(listed.pack))) listing.views.push(listed);
  }
  return listing;
}

/** The project's `.archon/packs/*.factory-view.json` files, by name. */
async function projectFiles(project: string): Promise<Listed[]> {
  const dir = join(project, '.archon', 'packs');
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    return [{ pack: dir, source: 'project-file', path: dir, error: (error as Error).message }];
  }
  const listed: Listed[] = [];
  for (const name of names.filter(n => n.endsWith(FACTORY_VIEW_PROJECT_SUFFIX)).sort()) {
    const key = name.slice(0, -FACTORY_VIEW_PROJECT_SUFFIX.length);
    const path = join(dir, name);
    let content: string;
    try {
      content = await readFile(path, 'utf8');
    } catch (error) {
      listed.push({ pack: key, source: 'project-file', path, error: (error as Error).message });
      continue;
    }
    listed.push(parseDeclaration(key, 'project-file', path, content));
  }
  return listed;
}

/**
 * Parse one file found as `found`: a pack key for a project file, else the pack's identity.
 * The declaration's `pack` must agree with where it was found, or the view would draw one
 * pack's runs under another's name.
 */
function parseDeclaration(
  found: string,
  source: FactoryViewSource,
  path: string,
  content: string
): Listed {
  const failed = (error: string): Listed => ({ pack: found, source, path, error });
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch (error) {
    return failed(`${path} is not JSON: ${(error as Error).message}`);
  }
  const parsed = factoryViewSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    return failed(`${path} is invalid: ${issues.join('; ')}`);
  }
  const pack = parsed.data.pack;
  const identity = source === 'project-file' ? factoryPackKey(pack) : pack;
  if (identity !== found)
    return failed(
      source === 'project-file'
        ? `${path} declares pack "${pack}", whose project file is ${factoryPackKey(pack)}${FACTORY_VIEW_PROJECT_SUFFIX}`
        : `${path} declares pack "${pack}" but belongs to pack "${found}"`
    );
  return { pack, source, path, declaration: parsed.data };
}

/** The run names, as runs record them, of every workflow a listed view's stages name. */
export function factoryViewWorkflowNames(listing: FactoryViewsListing): string[] {
  const names = new Set<string>();
  for (const view of listing.views)
    for (const stage of view.declaration.stages)
      for (const workflow of stage.workflows)
        names.add(factoryRunWorkflowName(view.pack, workflow));
  return [...names];
}

/**
 * The views that apply to a project: its own project files, and a pack's view once the
 * project has run a workflow the view names. `ranWorkflowNames` holds run names as runs
 * record them. Errors stay listed, so a broken file is never silent.
 */
export function factoryViewsForProject(
  listing: FactoryViewsListing,
  ranWorkflowNames: ReadonlySet<string>
): FactoryViewsListing {
  return {
    views: listing.views.filter(
      view =>
        view.source === 'project-file' ||
        view.declaration.stages.some(stage =>
          stage.workflows.some(workflow =>
            ranWorkflowNames.has(factoryRunWorkflowName(view.pack, workflow))
          )
        )
    ),
    errors: listing.errors,
  };
}
