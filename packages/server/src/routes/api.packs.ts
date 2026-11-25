/**
 * GET /api/packs/{pack}/graph: a pack's stage graph in this install, for one codebase's
 * project (`readPackGraph`), the same read `archon pack graph` prints.
 * GET /api/packs/{pack}/view: the factory view file that graph's copy of the pack ships,
 * checked against it (`readFactoryView`).
 */
import type { Context } from 'hono';
import { type OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { isAbsolute } from 'node:path';
import { TriggerFileError } from '@archon/core/workflows/run-ended';
import { readFactoryView } from '@archon/workflows/factory-view';
import { FileStoreUnsupportedError } from '@archon/workflows/file-store';
import { PackNotFoundError, type PackGraph } from '@archon/workflows/pack-graph';
import { liveSourceRoots } from '@archon/workflows/workflow-source';
import {
  apiError,
  getLog,
  getValidatedQuery,
  jsonError,
  openApiRouteRegistrar,
} from './api-route-kit';
import { packFactoryViewResponseSchema, packGraphResponseSchema } from './schemas/workflow.schemas';

const packGraphParamsSchema = z.object({
  pack: z.string().min(1).openapi({ description: 'The pack key: its folder name' }),
});

const packGraphQuerySchema = z.object({
  codebaseId: z.string().min(1).openapi({
    description: 'The codebase whose project the pack is discovered from and its arrows launch in',
  }),
  workflowSource: z.string().min(1).optional().openapi({
    description:
      "An absolute directory the pack's workflows are discovered from instead of the codebase, as a binding's launch.discoveryCwd names it",
  }),
});

const getPackGraphRoute = createRoute({
  method: 'get',
  path: '/api/packs/{pack}/graph',
  tags: ['Workflows'],
  summary: "A pack's stages, outcomes and run-ended arrows, each active or declared",
  request: { params: packGraphParamsSchema, query: packGraphQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: packGraphResponseSchema } },
      description: 'OK',
    },
    400: jsonError('workflowSource is not an absolute path'),
    404: jsonError('Codebase not found, or no workflow of the pack was found'),
    422: jsonError(
      'A trigger file in the install cannot be read, or the store cannot hold run-ended bindings; the error names the file'
    ),
    500: jsonError('Server error'),
  },
});

const getPackViewRoute = createRoute({
  method: 'get',
  path: '/api/packs/{pack}/view',
  tags: ['Workflows'],
  summary:
    'The factory view file the pack ships (.shared/factory-view.json), or null, with its problems against the pack graph',
  request: { params: packGraphParamsSchema, query: packGraphQuerySchema },
  responses: {
    200: {
      content: { 'application/json': { schema: packFactoryViewResponseSchema } },
      description: 'OK',
    },
    400: jsonError('workflowSource is not an absolute path'),
    404: jsonError('Codebase not found, or no workflow of the pack was found'),
    422: jsonError(
      'A trigger file in the install cannot be read, or the store cannot hold run-ended bindings; the error names the file'
    ),
    500: jsonError('Server error'),
  },
});

interface PackRouteDeps {
  codebaseCwd: (id: string) => Promise<string | null>;
  readPackGraph: (cwd: string, pack: string, workflowSource?: string) => Promise<PackGraph>;
}

/**
 * Reads the pack graph for the request and answers with `respond(graph, source)`, or with the
 * error the graph read maps to. `source` is the directory the pack was discovered from.
 */
async function withPackGraph(
  c: Context,
  deps: PackRouteDeps,
  respond: (graph: PackGraph, source: string) => Promise<Response>
): Promise<Response> {
  const pack = c.req.param('pack') ?? '';
  const { codebaseId, workflowSource } = getValidatedQuery(c, packGraphQuerySchema);
  if (workflowSource !== undefined && !isAbsolute(workflowSource))
    return apiError(c, 400, 'workflowSource must be an absolute path');
  const cwd = await deps.codebaseCwd(codebaseId);
  if (cwd === null) return apiError(c, 404, 'Codebase not found');
  try {
    return await respond(
      await deps.readPackGraph(cwd, pack, workflowSource),
      workflowSource ?? cwd
    );
  } catch (error) {
    if (error instanceof PackNotFoundError) return apiError(c, 404, error.message);
    // The operator's own files: the message names the file and what to fix, as the CLI does.
    if (error instanceof TriggerFileError || error instanceof FileStoreUnsupportedError) {
      getLog().warn({ err: error, codebaseId, pack }, 'read_pack_graph_refused');
      return apiError(c, 422, error.message);
    }
    getLog().error({ err: error, codebaseId, pack }, 'read_pack_graph_failed');
    return apiError(c, 500, 'Failed to read the pack graph');
  }
}

export function registerPackRoutes(app: OpenAPIHono, deps: PackRouteDeps): void {
  const register = openApiRouteRegistrar(app);
  register(getPackGraphRoute, c => withPackGraph(c, deps, async graph => c.json(graph)));
  register(getPackViewRoute, c =>
    withPackGraph(c, deps, async (graph, source) =>
      c.json(await readFactoryView(liveSourceRoots(source), graph))
    )
  );
}
