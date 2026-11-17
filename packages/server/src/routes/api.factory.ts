/**
 * Read-only routes for the console's Software Factory section. Nothing here writes: the
 * section reads the engine's own records, the factory view and overview files packs and
 * projects ship (`@archon/workflows/factory-views`, `factory-overviews`), and asks the change host whether a
 * change merged through the forge seam.
 */
import { type OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { type ChangeMergeState, prRefFromAudits } from '@archon/adapters/forge-host';
import {
  FactoryRunFactsMemo,
  readFactoryItem,
  readFactoryProgress,
  type FactoryChangeState,
} from '@archon/workflows/factory-items';
import { ITEM_WINDOW_MAX_LIMIT } from '@archon/workflows/item-window';
import {
  discoverFactoryOverviews,
  factoryOverviewForPack,
} from '@archon/workflows/factory-overviews';
import {
  discoverFactoryViews,
  factoryPackIsInstalled,
  factoryRunWorkflowName,
  factoryViewWorkflowNames,
  factoryViewsForProject,
} from '@archon/workflows/factory-views';
import { factoryWorkflowSteps } from '@archon/workflows/factory-steps';
import type { WorkflowConfig } from '@archon/workflows/deps';
import type { ItemReadSource } from '@archon/workflows/item-read';
import type { FactoryViewsListing } from '@archon/workflows/schemas/factory-view';
import type { WorkflowLoadResult } from '@archon/workflows/schemas/workflow';
import { liveSourceRoots, workflowSourceConfigFrom } from '@archon/workflows/workflow-source';
import {
  apiError,
  getLog,
  getValidatedQuery,
  jsonError,
  openApiRouteRegistrar,
} from './api-route-kit';
import {
  factoryItemDetailResponseSchema,
  factoryOverviewResponseSchema,
  factoryProgressResponseSchema,
  factoryViewsSchema,
  factoryWorkflowSchema,
} from './schemas/factory.schemas';

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

const factoryOverviewQuerySchema = z.object({
  codebaseId: z
    .string()
    .min(1)
    .openapi({ description: 'The project whose factory overview to read.' }),
});

const getFactoryOverviewRoute = createRoute({
  method: 'get',
  path: '/api/factory/overview',
  tags: ['Workflows'],
  summary: "The factory overview of the pack a project's factory view draws",
  description:
    "The hand-written explainer of how the factory runs, for the pack of the first factory view that applies to the project: the project's `.archon/packs/<pack key>.factory-overview.json`, else the pack's own `.shared/factory-overview.json`. `overview` is null when the pack has none. Files that could not be read or did not validate are listed under `errors` with their file.",
  request: { query: factoryOverviewQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: factoryOverviewResponseSchema } },
      description: 'OK',
    },
    404: jsonError('Codebase not found, or no factory view applies to it'),
    500: jsonError('Server error'),
  },
});

const factoryProgressQuerySchema = z.object({
  codebaseId: z.string().min(1).openapi({ description: 'The project the items belong to.' }),
  keys: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1).max(ITEM_WINDOW_MAX_LIMIT)])
    .openapi({
      description:
        "The items' keys, as `GET /api/items` takes them: repeat `keys` once per item, up to a page of `GET /api/items/window`.",
    }),
});

const getFactoryProgressRoute = createRoute({
  method: 'get',
  path: '/api/factory/progress',
  tags: ['Workflows'],
  summary: "The board progress of a project's items, by key",
  description:
    'What the board needs of each item that its read (`GET /api/items/window`) does not carry, derived through the first factory view that applies to the project (`pack` names it): the running step, the declared rounds loop, how often a return point sent it back, its title, and its change, with whether that merged as the change host reports it (cached on the server). A key the project has no item under is left out; an item whose progress could not be derived reads null.',
  request: { query: factoryProgressQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: factoryProgressResponseSchema } },
      description: 'OK',
    },
    400: jsonError('Invalid query'),
    404: jsonError('Codebase not found, or no factory view applies to it'),
    500: jsonError('Server error'),
  },
});

const factoryWorkflowQuerySchema = z.object({
  codebaseId: z.string().min(1).openapi({ description: 'The project whose factory view to read.' }),
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

const factoryItemQuerySchema = z.object({
  codebaseId: z.string().min(1).openapi({ description: 'The project the item belongs to.' }),
  key: z
    .string()
    .min(1)
    .openapi({ description: "The item's key in the project, as `GET /api/items` takes it." }),
});

const getFactoryItemRoute = createRoute({
  method: 'get',
  path: '/api/factory/item',
  tags: ['Workflows'],
  summary: 'One item with its progress and the timeline facts of each of its runs',
  description:
    "The item's read, as `GET /api/items` returns it, with its `progress` as `GET /api/factory/progress` reads it, plus `runs`: for each of the item's runs, in the item read's order, the workflow as the view declares it, the run's cost, its running step while it runs, and each round of the declared rounds loop with the steps that recorded an outcome in it.",
  request: { query: factoryItemQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: factoryItemDetailResponseSchema } },
      description: 'OK',
    },
    400: jsonError('Invalid query'),
    404: jsonError('Codebase not found, no factory view applies to it, or no such item'),
    500: jsonError('Server error'),
  },
});

/** The merge state of one change, as the forge seam answered it (`changeMergeState`). */
export type ChangeMergeLookup = (
  url: string,
  audits: readonly unknown[],
  branches: () => Promise<readonly string[]>
) => Promise<ChangeMergeState>;

export interface FactoryRouteDeps {
  /** A registered codebase's checkout and the engine's project key for it; null when unknown. */
  codebase: (id: string) => Promise<{ cwd: string; projectKey: string } | null>;
  loadConfig: (cwd: string) => Promise<WorkflowConfig>;
  /** Which of these run names (as runs record them) the codebase has any run of. */
  ranWorkflows: (codebaseId: string, names: readonly string[]) => Promise<ReadonlySet<string>>;
  itemsSource: ItemReadSource;
  changeMergeState: ChangeMergeLookup;
  /** Workflow discovery for a project, as runs see it. */
  discoverWorkflows: (cwd: string) => Promise<WorkflowLoadResult>;
  /** How long one read waits on a lookup no request has made yet; tests shorten it. */
  changeStateWaitMs?: number;
  now?: () => number;
}

/** How long a change that has not merged keeps its answer. A merge does not come undone. */
const CHANGE_STATE_TTL_MS = 60_000;
/**
 * A forge read retries temporary failures for about 7 s; a read answers before that and
 * the lookup finishes into the cache for the next one.
 */
const CHANGE_STATE_WAIT_MS = 4_000;

type ChangeAnswer = Awaited<ReturnType<ChangeMergeLookup>>;

/**
 * The change host's answer for each change URL, shared by every request: one lookup in
 * flight per URL, a merged answer kept, any other for `CHANGE_STATE_TTL_MS`. A stale
 * answer is served while its refresh runs. A cold lookup slower than the wait answers
 * `unknown` for that request only. The pull request number is the forge's, else the one
 * the run's own audit rows name, so a cold `unknown` still carries it when they do.
 */
export function changeStateCache(
  deps: Pick<FactoryRouteDeps, 'changeMergeState' | 'changeStateWaitMs' | 'now'>
): FactoryChangeState {
  const now = deps.now ?? Date.now;
  const waitMs = deps.changeStateWaitMs ?? CHANGE_STATE_WAIT_MS;
  const answers = new Map<string, { answer: ChangeAnswer; at: number }>();
  const pending = new Map<string, Promise<ChangeAnswer>>();
  const lookup = (
    url: string,
    audits: readonly unknown[],
    branches: () => Promise<readonly string[]>
  ): Promise<ChangeAnswer> => {
    const running = pending.get(url);
    if (running !== undefined) return running;
    const started = deps
      .changeMergeState(url, audits, branches)
      .catch(
        (error: unknown): ChangeAnswer => ({
          merged: 'unknown',
          mergedAt: null,
          number: null,
          reason: (error as Error).message,
        })
      )
      .then(answer => {
        if (answer.merged === 'unknown')
          getLog().warn({ url, reason: answer.reason }, 'factory_change_state_unknown');
        answers.set(url, { answer, at: now() });
        pending.delete(url);
        return answer;
      });
    pending.set(url, started);
    return started;
  };
  const shown = (answer: ChangeAnswer, url: string, audits: readonly unknown[]) => ({
    merged: answer.merged,
    mergedAt: answer.mergedAt,
    number: answer.number ?? prRefFromAudits(url, audits)?.number ?? null,
  });
  return async (url, audits, branches) => {
    const known = answers.get(url);
    if (known !== undefined) {
      if (known.answer.merged !== true && now() - known.at >= CHANGE_STATE_TTL_MS)
        void lookup(url, audits, branches);
      return shown(known.answer, url, audits);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const waited = new Promise<ChangeAnswer>(resolve => {
      timer = setTimeout(() => {
        resolve({ merged: 'unknown', mergedAt: null, number: null });
      }, waitMs);
    });
    const answer = await Promise.race([lookup(url, audits, branches), waited]);
    clearTimeout(timer);
    return shown(answer, url, audits);
  };
}

type ProjectRoots = ReturnType<typeof liveSourceRoots>;

/** The live source roots of the project checked out at `cwd`, under its config. */
async function projectRoots(deps: FactoryRouteDeps, cwd: string): Promise<ProjectRoots> {
  return liveSourceRoots(cwd, workflowSourceConfigFrom(await deps.loadConfig(cwd)));
}

/**
 * The factory views that apply to the project read through `roots`. Every factory route
 * reads them here, so they cannot disagree about which view applies.
 */
async function applyingViews(
  deps: FactoryRouteDeps,
  codebaseId: string,
  roots: ProjectRoots
): Promise<FactoryViewsListing> {
  const listing = await discoverFactoryViews(roots);
  const ran = await deps.ranWorkflows(codebaseId, factoryViewWorkflowNames(listing));
  return factoryViewsForProject(listing, ran);
}

export function registerFactoryRoutes(app: OpenAPIHono, deps: FactoryRouteDeps): void {
  const register = openApiRouteRegistrar(app);
  const changeState = changeStateCache(deps);
  const memo = new FactoryRunFactsMemo();

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
      getLog().error({ err: error, codebaseId }, 'discover_factory_views_failed');
      return apiError(c, 500, 'Failed to discover factory views');
    }
  });

  register(getFactoryOverviewRoute, async c => {
    const { codebaseId } = getValidatedQuery(c, factoryOverviewQuerySchema);
    const project = await deps.codebase(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      // The pack the Factory tab draws, so the overview explains the factory the tab shows.
      const roots = await projectRoots(deps, project.cwd);
      const [view] = (await applyingViews(deps, codebaseId, roots)).views;
      if (view === undefined) return apiError(c, 404, 'No factory view applies to this project');
      const found = factoryOverviewForPack(await discoverFactoryOverviews(roots), view.pack);
      for (const { pack, path, error } of found.errors)
        getLog().warn({ codebaseId, pack, path, error }, 'factory_overview_invalid');
      return c.json(found);
    } catch (error) {
      getLog().error({ err: error, codebaseId }, 'discover_factory_overview_failed');
      return apiError(c, 500, 'Failed to discover the factory overview');
    }
  });

  register(getFactoryItemRoute, async c => {
    const { codebaseId, key } = getValidatedQuery(c, factoryItemQuerySchema);
    const project = await deps.codebase(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      // The view the progress route reads, so an item reads here as it does on the board.
      const roots = await projectRoots(deps, project.cwd);
      const [view] = (await applyingViews(deps, codebaseId, roots)).views;
      if (view === undefined) return apiError(c, 404, 'No factory view applies to this project');
      const detail = await readFactoryItem(
        deps.itemsSource,
        {
          view: view.declaration,
          pack: view.pack,
          projectKey: project.projectKey,
          changeState,
          memo,
          onProgressError: (itemId, error) => {
            getLog().error({ err: error, codebaseId, itemId }, 'factory_item_progress_failed');
          },
        },
        key
      );
      if (detail === null) return apiError(c, 404, 'No such item in this project');
      return c.json(detail);
    } catch (error) {
      getLog().error({ err: error, codebaseId }, 'factory_item_read_failed');
      return apiError(c, 500, 'Failed to read the factory item');
    }
  });

  register(getFactoryProgressRoute, async c => {
    const { codebaseId, keys } = getValidatedQuery(c, factoryProgressQuerySchema);
    const project = await deps.codebase(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      // The first view, as the console's Factory tab draws it; `pack` says which.
      const roots = await projectRoots(deps, project.cwd);
      const [view] = (await applyingViews(deps, codebaseId, roots)).views;
      if (view === undefined) return apiError(c, 404, 'No factory view applies to this project');
      const progress = await readFactoryProgress(
        deps.itemsSource,
        {
          view: view.declaration,
          pack: view.pack,
          projectKey: project.projectKey,
          changeState,
          memo,
          onProgressError: (itemId, error) => {
            getLog().error({ err: error, codebaseId, itemId }, 'factory_item_progress_failed');
          },
        },
        typeof keys === 'string' ? [keys] : keys
      );
      return c.json(progress);
    } catch (error) {
      getLog().error({ err: error, codebaseId }, 'factory_progress_read_failed');
      return apiError(c, 500, 'Failed to read the factory progress');
    }
  });

  register(getFactoryWorkflowRoute, async c => {
    const { codebaseId, workflow } = getValidatedQuery(c, factoryWorkflowQuerySchema);
    const project = await deps.codebase(codebaseId);
    if (project === null) return apiError(c, 404, 'Codebase not found');
    try {
      const roots = await projectRoots(deps, project.cwd);
      const view = (await applyingViews(deps, codebaseId, roots)).views.find(candidate =>
        candidate.declaration.stages.some(stage => stage.workflows.includes(workflow))
      );
      if (view === undefined)
        return apiError(c, 404, `This factory has no stage that runs the workflow ${workflow}.`);
      const runName = factoryRunWorkflowName(view.pack, workflow);
      const entry = (await deps.discoverWorkflows(project.cwd)).workflows.find(
        candidate => candidate.workflow.name === runName
      );
      // Said for the person reading the stage page, who can act on it.
      if (entry === undefined)
        return apiError(
          c,
          404,
          factoryPackIsInstalled(view.pack)
            ? `The pack ${view.pack} is not installed here, so its workflow ${workflow} cannot be drawn. Install it with the command archon plugin add, then reload this page.`
            : `The pack ${view.pack} has no workflow ${workflow} in this project, so it cannot be drawn.`
        );
      return c.json(
        await factoryWorkflowSteps(workflow, entry.workflow, { cwd: project.cwd, deps, roots })
      );
    } catch (error) {
      getLog().error({ err: error, codebaseId, workflow }, 'read_factory_workflow_failed');
      return apiError(c, 500, 'Failed to read the workflow');
    }
  });
}
