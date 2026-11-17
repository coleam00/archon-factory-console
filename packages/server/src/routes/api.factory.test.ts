import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { trackTempRoots } from '@archon/paths/test-utils';
import { providerRegistry } from '@archon/providers';
import { discoverWorkflows } from '@archon/workflows/workflow-discovery';
import { registerFactoryViewsRoute, registerFactoryWorkflowRoute } from './api.factory';
import { factoryViewsSchema, factoryWorkflowSchema } from './schemas/factory.schemas';

const declaration = (pack: string, title: string): object => ({
  version: 1,
  pack,
  title,
  summary: 'Items in, changes out.',
  stages: [
    { id: 'build', label: 'Build', blurb: 'Builds.', group: 'build', workflows: ['deliver'] },
    { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
  ],
  placement: { 'deliver:ready': 'landed' },
  endings: {},
  landed: { stage: 'landed' },
  map: { cards: [{ stage: 'build', col: 1, row: 1 }], arrows: [] },
});

describe('GET /api/factory/views', () => {
  const track = trackTempRoots();

  async function factoryApp(
    files: Record<string, unknown>,
    ran: string[] = []
  ): Promise<{ app: OpenAPIHono; project: string; asked: string[][] }> {
    const project = track(await mkdtemp(join(tmpdir(), 'archon-factory-route-')));
    for (const [path, content] of Object.entries(files)) {
      const file = join(project, ...path.split('/'));
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
    }
    const asked: string[][] = [];
    const app = new OpenAPIHono();
    registerFactoryViewsRoute(app, {
      codebaseCwd: async id => (id === 'cb-1' ? project : null),
      loadConfig: async () => ({
        assistant: undefined,
        commands: {},
        assistants: { claude: {}, codex: {} },
      }),
      ranWorkflows: async (id, names) => {
        asked.push([id, ...names]);
        return new Set(ran);
      },
    });
    return { app, project, asked };
  }

  const views = async (app: OpenAPIHono): Promise<ReturnType<typeof factoryViewsSchema.parse>> => {
    const response = await app.request('/api/factory/views?codebaseId=cb-1');
    expect(response.status).toBe(200);
    return factoryViewsSchema.parse(await response.json());
  };

  test("a project's own file applies with no runs", async () => {
    const { app, project } = await factoryApp({
      '.archon/packs/acme.kit.factory-view.json': declaration('acme/kit', 'Kit factory'),
    });
    const listing = await views(app);
    expect(listing.views.map(v => [v.pack, v.source, v.path, v.declaration.title])).toEqual([
      [
        'acme/kit',
        'project-file',
        join(project, '.archon', 'packs', 'acme.kit.factory-view.json'),
        'Kit factory',
      ],
    ]);
  });

  test("a pack's own view applies only once the project ran a workflow it names", async () => {
    const files = {
      '.archon/workflows/factory/.shared/factory-view.json': declaration('factory', 'F'),
    };
    const unrun = await factoryApp(files);
    expect((await views(unrun.app)).views.find(v => v.pack === 'factory')).toBeUndefined();
    expect(unrun.asked).toEqual([['cb-1', 'deliver']]);

    const run = await factoryApp(files, ['deliver']);
    expect((await views(run.app)).views.find(v => v.pack === 'factory')?.source).toBe('project');
  });

  test('a malformed project file is listed under errors with its path', async () => {
    const { app, project } = await factoryApp({
      '.archon/packs/acme.kit.factory-view.json': '{ "version": ',
    });
    const listing = await views(app);
    const path = join(project, '.archon', 'packs', 'acme.kit.factory-view.json');
    expect(listing.views).toEqual([]);
    expect(listing.errors).toEqual([
      { pack: 'acme.kit', source: 'project-file', path, error: expect.stringContaining(path) },
    ]);
  });

  test('an unknown codebase returns 404', async () => {
    const { app } = await factoryApp({});
    const response = await app.request('/api/factory/views?codebaseId=missing');
    expect(response.status).toBe(404);
  });
});

describe('GET /api/factory/workflow', () => {
  const track = trackTempRoots();

  async function workflowApp(withWorkflow = true): Promise<OpenAPIHono> {
    const project = track(await mkdtemp(join(tmpdir(), 'archon-factory-workflow-')));
    const files: Record<string, string> = {
      '.archon/packs/kit.factory-view.json': JSON.stringify(declaration('kit', 'Kit factory')),
      '.archon/workflows/kit/deliver/deliver.yaml': [
        'name: deliver',
        'description: Delivers.',
        'nodes:',
        '  - id: rounds',
        '    loop_group:',
        '      max_iterations: 2',
        '      until_bash: "true"',
        '      nodes:',
        '        - id: fix',
        '          bash: echo fixed',
        '',
      ].join('\n'),
    };
    if (!withWorkflow) delete files['.archon/workflows/kit/deliver/deliver.yaml'];
    for (const [path, content] of Object.entries(files)) {
      const file = join(project, ...path.split('/'));
      await mkdir(join(file, '..'), { recursive: true });
      await writeFile(file, content);
    }
    const app = new OpenAPIHono();
    registerFactoryWorkflowRoute(app, {
      codebaseCwd: async id => (id === 'cb-1' ? project : null),
      loadConfig: async () => ({
        assistant: undefined,
        commands: {},
        assistants: { claude: {}, codex: {} },
      }),
      ranWorkflows: async () => new Set(),
      discoverWorkflows: cwd =>
        discoverWorkflows(cwd, { providers: providerRegistry, loadDefaults: false }),
    });
    return app;
  }

  test("returns the steps of a workflow the project's view names", async () => {
    const response = await (await workflowApp()).request(
      '/api/factory/workflow?codebaseId=cb-1&workflow=deliver'
    );
    expect(response.status).toBe(200);
    const body = factoryWorkflowSchema.parse(await response.json());
    expect([body.name, body.runName]).toEqual(['deliver', 'deliver']);
    expect(body.groups.map(g => [g.id, g.kind, g.maxRounds])).toEqual([['rounds', 'loop', 2]]);
    expect(body.steps.map(s => [s.key, s.kind, s.yaml])).toEqual([
      ['rounds.fix', 'bash', 'id: fix\nbash: echo fixed'],
    ]);
  });

  test('a workflow no applying view names returns 404', async () => {
    const response = await (await workflowApp()).request(
      '/api/factory/workflow?codebaseId=cb-1&workflow=other'
    );
    expect(response.status).toBe(404);
  });

  test('a workflow the view names but the project lacks returns 404 naming the pack', async () => {
    const response = await (await workflowApp(false)).request(
      '/api/factory/workflow?codebaseId=cb-1&workflow=deliver'
    );
    expect(response.status).toBe(404);
    const { error } = (await response.json()) as { error: string };
    // Read by a person on the stage page: it names the pack and the workflow.
    expect(error).toContain('kit');
    expect(error).toContain('deliver');
  });

  test('an unknown codebase returns 404', async () => {
    const response = await (await workflowApp()).request(
      '/api/factory/workflow?codebaseId=missing&workflow=deliver'
    );
    expect(response.status).toBe(404);
  });
});
