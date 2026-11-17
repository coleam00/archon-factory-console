/**
 * Read-only routes for the console's Software Factory section. Nothing here writes: the
 * section reads the engine's own records and the factory view declarations packs and
 * projects ship (`@archon/workflows/factory-views`).
 */
import { type OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  discoverFactoryViews,
  factoryViewWorkflowNames,
  factoryViewsForProject,
} from '@archon/workflows/factory-views';
import type { WorkflowConfig } from '@archon/workflows/deps';
import { liveSourceRoots, workflowSourceConfigFrom } from '@archon/workflows/workflow-source';
import {
  apiError,
  getLog,
  getValidatedQuery,
  jsonError,
  openApiRouteRegistrar,
} from './api-route-kit';
import { factoryViewsSchema } from './schemas/factory.schemas';

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

export function registerFactoryViewsRoute(
  app: OpenAPIHono,
  deps: {
    codebaseCwd: (id: string) => Promise<string | null>;
    loadConfig: (cwd: string) => Promise<WorkflowConfig>;
    /** Which of these run names (as runs record them) the codebase has any run of. */
    ranWorkflows: (codebaseId: string, names: readonly string[]) => Promise<ReadonlySet<string>>;
  }
): void {
  openApiRouteRegistrar(app)(getFactoryViewsRoute, async c => {
    const { codebaseId } = getValidatedQuery(c, factoryViewsQuerySchema);
    const project = await deps.codebaseCwd(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      const roots = liveSourceRoots(
        project,
        workflowSourceConfigFrom(await deps.loadConfig(project))
      );
      const listing = await discoverFactoryViews(roots);
      const ran = await deps.ranWorkflows(codebaseId, factoryViewWorkflowNames(listing));
      const applying = factoryViewsForProject(listing, ran);
      // The body lists these too; the log keeps them findable without a console open.
      for (const { pack, path, error } of applying.errors)
        getLog().warn({ codebaseId, pack, path, error }, 'factory_view_invalid');
      return c.json(applying);
    } catch (error) {
      getLog().error({ err: error, codebaseId }, 'discover_factory_views_failed');
      return apiError(c, 500, 'Failed to discover factory views');
    }
  });
}
