/**
 * Read-only routes for the console's Software Factory section: the presentation files packs and
 * projects ship (the factory view and overview files, `@archon/workflows/factory-views` and
 * `factory-overviews`, both found by the one pack-file reader `factory-pack-files.ts`). Nothing
 * here writes, and nothing here reads runs: the section composes the rest from Archon's generic
 * reads.
 */
import { type OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { isAbsolute } from 'node:path';
import {
  findFactoryOverviews,
  resolveFactoryPacks,
  type FactoryPackProject,
} from '@archon/workflows/factory-overviews';
import {
  findFactoryViews,
  factoryViewWorkflowNames,
  factoryViewsForProject,
} from '@archon/workflows/factory-views';
import type { WorkflowConfig } from '@archon/workflows/deps';
import type { FactoryPacks } from '@archon/workflows/schemas/factory-overview';
import type { FactoryViewsListing } from '@archon/workflows/schemas/factory-view';
import { liveSourceRoots, workflowSourceConfigFrom } from '@archon/workflows/workflow-source';
import {
  apiError,
  getLog,
  getValidatedQuery,
  jsonError,
  openApiRouteRegistrar,
} from './api-route-kit';
import { factoryPacksResponseSchema, factoryViewsSchema } from './schemas/factory.schemas';

const factoryViewsQuerySchema = z.object({
  codebaseId: z
    .string()
    .min(1)
    .openapi({ description: 'The project whose factory views to list.' }),
});

const getFactoryViewsRoute = createRoute({
  method: 'get',
  path: '/api/factory/views',
  tags: ['Workflows'],
  summary: 'The factory views that apply to a project',
  description:
    'A view applies when the project ships its own `.archon/packs/<pack key>.factory-view.json`, or when a pack declares one and the project has run a workflow the view names. Declarations that could not be read or did not validate are listed under `errors` with their file.',
  request: { query: factoryViewsQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: factoryViewsSchema } },
      description: 'OK',
    },
    404: jsonError('Codebase not found'),
    500: jsonError('Server error'),
  },
});

const getFactoryPacksRoute = createRoute({
  method: 'get',
  path: '/api/factory/packs',
  tags: ['Workflows'],
  summary: 'Every pack with a factory overview, and the projects that run it',
  description:
    "The hand-written explainers of how each pack's factory runs, across the install: the pack's own `.shared/factory-overview.json` first, else the first project (by name) shipping `.archon/packs/<pack key>.factory-overview.json`, named in `readFrom`. A pack whose files are all broken is listed with a null `overview` and its `errors`. `projects` are the projects a factory view of the pack applies to. A project that could not be read is listed under `unreadProjects`; the other packs still list.",
  responses: {
    200: {
      content: { 'application/json': { schema: factoryPacksResponseSchema } },
      description: 'OK',
    },
    500: jsonError('Server error'),
  },
});

export interface FactoryRouteDeps {
  /** A registered codebase's checkout; null when the codebase is unknown. */
  codebase: (id: string) => Promise<{ cwd: string } | null>;
  /** Every registered codebase, for the reads that span the install. */
  codebases: () => Promise<readonly { id: string; name: string; cwd: string }[]>;
  loadConfig: (cwd: string) => Promise<WorkflowConfig>;
  /** Which of these run names (as runs record them) the codebase has any run of. */
  ranWorkflows: (codebaseId: string, names: readonly string[]) => Promise<ReadonlySet<string>>;
}

type ProjectRoots = ReturnType<typeof liveSourceRoots>;

/** The live source roots of the project checked out at `cwd`, under its config. */
async function projectRoots(deps: FactoryRouteDeps, cwd: string): Promise<ProjectRoots> {
  return liveSourceRoots(cwd, workflowSourceConfigFrom(await deps.loadConfig(cwd)));
}

/**
 * The factory views that apply to the project read through `roots`. Both routes read them
 * here, so they cannot disagree about which view applies.
 */
async function applyingViews(
  deps: FactoryRouteDeps,
  codebaseId: string,
  roots: ProjectRoots
): Promise<FactoryViewsListing> {
  const listing = await findFactoryViews(roots);
  const ran = await deps.ranWorkflows(codebaseId, factoryViewWorkflowNames(listing));
  return factoryViewsForProject(listing, ran);
}

/**
 * Every pack with an overview across the install: the home scopes read once with no
 * project, then each registered project's own files and applying views.
 */
async function factoryPacks(deps: FactoryRouteDeps): Promise<FactoryPacks> {
  const home = await findFactoryOverviews(liveSourceRoots(null));
  const projects = await Promise.all(
    (await deps.codebases()).map(async ({ id, name, cwd }): Promise<FactoryPackProject> => {
      try {
        if (!isAbsolute(cwd)) throw new Error(`its checkout path "${cwd}" is not absolute`);
        const roots = await projectRoots(deps, cwd);
        const listing = await findFactoryOverviews(roots);
        const views = (await applyingViews(deps, id, roots)).views;
        return { codebaseId: id, name, listing, viewPacks: views.map(view => view.pack) };
      } catch (error) {
        getLog().warn({ err: error, codebaseId: id }, 'factory_pack_project_unreadable');
        return { codebaseId: id, name, error: (error as Error).message };
      }
    })
  );
  return resolveFactoryPacks({ home, projects });
}

export function registerFactoryRoutes(app: OpenAPIHono, deps: FactoryRouteDeps): void {
  const register = openApiRouteRegistrar(app);

  register(getFactoryViewsRoute, async c => {
    const { codebaseId } = getValidatedQuery(c, factoryViewsQuerySchema);
    const project = await deps.codebase(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      const roots = await projectRoots(deps, project.cwd);
      const applying = await applyingViews(deps, codebaseId, roots);
      // The body lists these too; the log keeps them findable without a console open.
      for (const { pack, path, error } of applying.errors)
        getLog().warn({ codebaseId, pack, path, error }, 'factory_view_invalid');
      return c.json(applying);
    } catch (error) {
      getLog().error({ err: error, codebaseId }, 'read_factory_views_failed');
      return apiError(c, 500, 'Failed to read the factory views');
    }
  });

  register(getFactoryPacksRoute, async c => {
    try {
      const packs = await factoryPacks(deps);
      for (const { pack, path, error } of [...packs.errors, ...packs.packs.flatMap(p => p.errors)])
        getLog().warn({ pack, path, error }, 'factory_overview_invalid');
      return c.json(packs);
    } catch (error) {
      getLog().error({ err: error }, 'read_factory_packs_failed');
      return apiError(c, 500, 'Failed to read the factory packs');
    }
  });
}
