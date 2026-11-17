/**
 * Read-only routes for the console's Software Factory section. Nothing here writes: the
 * section reads the engine's own records and the factory view declarations packs and
 * projects ship (`@archon/workflows/factory-views`).
 */
import { type OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  discoverFactoryViews,
  factoryRunWorkflowName,
  factoryViewWorkflowNames,
  factoryViewsForProject,
} from '@archon/workflows/factory-views';
import { factoryWorkflowSteps } from '@archon/workflows/factory-steps';
import type { WorkflowConfig } from '@archon/workflows/deps';
import type { WorkflowLoadResult } from '@archon/workflows/schemas/workflow';
import type { FactoryViewsListing } from '@archon/workflows/schemas/factory-view';
import { liveSourceRoots, workflowSourceConfigFrom } from '@archon/workflows/workflow-source';
import {
  apiError,
  getLog,
  getValidatedQuery,
  jsonError,
  openApiRouteRegistrar,
} from './api-route-kit';
import { factoryViewsSchema, factoryWorkflowSchema } from './schemas/factory.schemas';

const codebaseIdSchema = z
  .string()
  .min(1)
  .openapi({ description: 'The project whose factory views to read.' });

const factoryViewsQuerySchema = z.object({ codebaseId: codebaseIdSchema });

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

const factoryWorkflowQuerySchema = z.object({
  codebaseId: codebaseIdSchema,
  workflow: z
    .string()
    .min(1)
    .openapi({ description: "A workflow a factory view's stage names, as the view names it." }),
});

const getFactoryWorkflowRoute = createRoute({
  method: 'get',
  path: '/api/factory/workflow',
  tags: ['Workflows'],
  summary: "One workflow's steps, as a factory view draws them",
  description:
    "The steps of a workflow a factory view applying to the project names, from the definition runs execute: each step keyed as run events name it, the loop groups and included workflows that frame it, its kind, declared model, `when:`, the prompt it runs and the YAML its author wrote. The first applying view whose stages name the workflow says which pack's workflow it is.",
  request: { query: factoryWorkflowQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: factoryWorkflowSchema } },
      description: 'OK',
    },
    404: jsonError('Codebase, view or workflow not found'),
    500: jsonError('Server error'),
  },
});

interface FactoryViewsDeps {
  codebaseCwd: (id: string) => Promise<string | null>;
  loadConfig: (cwd: string) => Promise<WorkflowConfig>;
  /** Which of these run names (as runs record them) the codebase has any run of. */
  ranWorkflows: (codebaseId: string, names: readonly string[]) => Promise<ReadonlySet<string>>;
}

/** The views that apply to a project. Both routes read through this, so they cannot disagree. */
async function applyingViews(
  deps: FactoryViewsDeps,
  codebaseId: string,
  roots: ReturnType<typeof liveSourceRoots>
): Promise<FactoryViewsListing> {
  const listing = await discoverFactoryViews(roots);
  const ran = await deps.ranWorkflows(codebaseId, factoryViewWorkflowNames(listing));
  return factoryViewsForProject(listing, ran);
}

export function registerFactoryViewsRoute(app: OpenAPIHono, deps: FactoryViewsDeps): void {
  openApiRouteRegistrar(app)(getFactoryViewsRoute, async c => {
    const { codebaseId } = getValidatedQuery(c, factoryViewsQuerySchema);
    const project = await deps.codebaseCwd(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      const roots = liveSourceRoots(
        project,
        workflowSourceConfigFrom(await deps.loadConfig(project))
      );
      const applying = await applyingViews(deps, codebaseId, roots);
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

export function registerFactoryWorkflowRoute(
  app: OpenAPIHono,
  deps: FactoryViewsDeps & {
    /** Workflow discovery for a project, as runs see it. */
    discoverWorkflows: (cwd: string) => Promise<WorkflowLoadResult>;
  }
): void {
  openApiRouteRegistrar(app)(getFactoryWorkflowRoute, async c => {
    const { codebaseId, workflow } = getValidatedQuery(c, factoryWorkflowQuerySchema);
    const project = await deps.codebaseCwd(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      const roots = liveSourceRoots(
        project,
        workflowSourceConfigFrom(await deps.loadConfig(project))
      );
      const applying = await applyingViews(deps, codebaseId, roots);
      const view = applying.views.find(candidate =>
        candidate.declaration.stages.some(stage => stage.workflows.includes(workflow))
      );
      if (view === undefined)
        return apiError(c, 404, `No factory view here names the workflow ${workflow}`);
      const runName = factoryRunWorkflowName(view.pack, workflow);
      const entry = (await deps.discoverWorkflows(project)).workflows.find(
        candidate => candidate.workflow.name === runName
      );
      if (entry === undefined)
        return apiError(c, 404, `The workflow ${runName} is not installed for this project`);
      return c.json(
        await factoryWorkflowSteps(workflow, entry.workflow, {
          cwd: project,
          deps,
          roots,
        })
      );
    } catch (error) {
      getLog().error({ err: error, codebaseId, workflow }, 'read_factory_workflow_failed');
      return apiError(c, 500, 'Failed to read the workflow');
    }
  });
}
