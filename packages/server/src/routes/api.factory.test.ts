import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ChangeMergeState } from '@archon/adapters/forge-host';
import { trackTempRoots } from '@archon/paths/test-utils';
import { providerRegistry } from '@archon/providers';
import type { ItemReadSource } from '@archon/workflows/item-read';
import type { WorkflowEventRow } from '@archon/workflows/schemas/workflow-event';
import type { WorkflowItem, WorkflowRun } from '@archon/workflows/schemas/workflow-run';
import { discoverWorkflows } from '@archon/workflows/workflow-discovery';
import { changeStateCache, registerFactoryRoutes, type FactoryRouteDeps } from './api.factory';
import {
  factoryItemDetailResponseSchema,
  factoryOverviewResponseSchema,
  factoryProgressResponseSchema,
  factoryViewsSchema,
  factoryWorkflowSchema,
} from './schemas/factory.schemas';

const declaration = (pack: string, title: string): Record<string, unknown> => ({
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
  map: { cards: [{ stage: 'build' }], arrows: [] },
});

async function projectWith(
  track: (path: string) => string,
  files: Record<string, unknown>
): Promise<string> {
  const project = track(await mkdtemp(join(tmpdir(), 'archon-factory-route-')));
  for (const [path, content] of Object.entries(files)) {
    const file = join(project, ...path.split('/'));
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return project;
}

/** Deps for a project with no items; each test replaces what it reads. */
const noItems: FactoryRouteDeps = {
  codebase: async () => null,
  loadConfig: async () => ({
    assistant: undefined,
    commands: {},
    assistants: { claude: {}, codex: {} },
  }),
  ranWorkflows: async () => new Set(),
  itemsSource: {} as ItemReadSource,
  changeMergeState: async () => {
    throw new Error('no change is looked up here');
  },
  discoverWorkflows: async () => {
    throw new Error('no workflow is discovered here');
  },
};

describe('GET /api/factory/views', () => {
  const track = trackTempRoots();

  async function factoryApp(
    files: Record<string, unknown>,
    ran: string[] = []
  ): Promise<{ app: OpenAPIHono; project: string; asked: string[][] }> {
    const project = await projectWith(track, files);
    const asked: string[][] = [];
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebase: async id => (id === 'cb-1' ? { cwd: project, projectKey: 'acme/web' } : null),
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

  test('each view names its pack key and the run names of its workflows', async () => {
    const { app } = await factoryApp({
      '.archon/packs/acme.kit.factory-view.json': declaration('acme/kit', 'Kit factory'),
    });
    const [view] = (await views(app)).views;
    expect([view?.packKey, view?.runNames]).toEqual(['acme.kit', { deliver: 'acme/kit:deliver' }]);
  });

  test('an unknown codebase returns 404', async () => {
    const { app } = await factoryApp({});
    const response = await app.request('/api/factory/views?codebaseId=missing');
    expect(response.status).toBe(404);
  });
});

describe('GET /api/factory/overview', () => {
  const track = trackTempRoots();
  const viewFile = '.archon/packs/acme.kit.factory-view.json';
  const overviewFile = '.archon/packs/acme.kit.factory-overview.json';
  const overview = {
    version: 1,
    pack: 'acme/kit',
    title: 'How the kit works',
    caption: 'Work comes in and lands.',
    root: 'top',
    views: {
      top: {
        cards: [
          { id: 'a', title: 'A', text: 'In.', icon: 'inbox', kind: 'input', col: 1, row: 1 },
          { id: 'b', title: 'B', text: 'Out.', icon: 'flag', kind: 'outcome', col: 2, row: 1 },
        ],
        edges: [
          { from: 'a', to: 'b', kind: 'feeds' },
          { from: 'b', to: 'a', kind: 'loops-back' },
        ],
      },
    },
  };

  async function read(
    files: Record<string, unknown>,
    codebaseId = 'cb-1'
  ): Promise<{ status: number; body: unknown; project: string }> {
    const project = await projectWith(track, files);
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebase: async id => (id === 'cb-1' ? { cwd: project, projectKey: 'acme/web' } : null),
    });
    const response = await app.request(`/api/factory/overview?codebaseId=${codebaseId}`);
    return { status: response.status, body: await response.json(), project };
  }

  test("the overview of the applying view's pack, from the project file", async () => {
    const { status, body, project } = await read({
      [viewFile]: declaration('acme/kit', 'Kit'),
      [overviewFile]: overview,
    });
    expect(status).toBe(200);
    const found = factoryOverviewResponseSchema.parse(body);
    expect(found.errors).toEqual([]);
    expect([found.overview?.pack, found.overview?.source, found.overview?.path]).toEqual([
      'acme/kit',
      'project-file',
      join(project, '.archon', 'packs', 'acme.kit.factory-overview.json'),
    ]);
    expect(found.overview?.declaration.title).toBe('How the kit works');
  });

  test('null when the pack has no overview', async () => {
    const { status, body } = await read({ [viewFile]: declaration('acme/kit', 'Kit') });
    expect(status).toBe(200);
    expect(factoryOverviewResponseSchema.parse(body)).toEqual({ overview: null, errors: [] });
  });

  test('a broken overview file is listed under errors with its path', async () => {
    const { body, project } = await read({
      [viewFile]: declaration('acme/kit', 'Kit'),
      [overviewFile]: { ...overview, root: 'nope' },
    });
    const path = join(project, '.archon', 'packs', 'acme.kit.factory-overview.json');
    expect(factoryOverviewResponseSchema.parse(body)).toEqual({
      overview: null,
      errors: [
        { pack: 'acme.kit', source: 'project-file', path, error: expect.stringContaining('root') },
      ],
    });
  });

  test("another pack's overview is not this factory's", async () => {
    const { body } = await read({
      [viewFile]: declaration('acme/kit', 'Kit'),
      '.archon/packs/other.kit.factory-overview.json': { ...overview, pack: 'other/kit' },
    });
    expect(factoryOverviewResponseSchema.parse(body)).toEqual({ overview: null, errors: [] });
  });

  test('404 for an unknown codebase, and when no factory view applies', async () => {
    expect((await read({ [overviewFile]: overview }, 'missing')).status).toBe(404);
    expect((await read({ [overviewFile]: overview })).status).toBe(404);
  });
});

describe('GET /api/factory/progress and /api/factory/item', () => {
  const track = trackTempRoots();
  const items: [WorkflowItem, WorkflowItem] = [
    { id: 'item-a', projectKey: 'acme/web', key: '1' },
    { id: 'item-b', projectKey: 'acme/web', key: '2' },
  ];
  const run = (id: string, item: WorkflowItem, fields: Partial<WorkflowRun>): WorkflowRun => ({
    origin: null,
    id,
    workflow_name: 'acme/kit:deliver',
    conversation_id: null,
    parent_conversation_id: null,
    codebase_id: 'cb-1',
    status: 'completed',
    outcome: null,
    completed_outcome: 'ready',
    user_message: '',
    metadata: { inputs: { item: `#${item.key} Item ${item.key}\n\nThe body.` } },
    active_phase_started_at: null,
    started_at: new Date('2026-11-16T10:00:00Z'),
    completed_at: new Date('2026-11-16T10:30:00Z'),
    last_activity_at: null,
    working_path: null,
    user_id: null,
    parent_run_id: null,
    adopted_from_run_id: null,
    output_root: null,
    checkout_baseline: null,
    item_id: item.id,
    ...fields,
  });
  const runs: Record<string, WorkflowRun[]> = {
    '1': [run('run-a', items[0], {})],
    '2': [
      run('run-b', items[1], { status: 'running', completed_at: null, completed_outcome: null }),
    ],
  };
  const CHANGE = 'https://forge.example/acme/web/pull/7';
  const events: WorkflowEventRow[] = [
    {
      // The shape a completed run records: its terminal record carries the declared result.
      id: 'e0',
      workflow_run_id: 'run-a',
      event_type: 'workflow_completed',
      step_index: null,
      step_name: null,
      data: {
        terminal_record: {
          run_id: 'run-a',
          status: 'completed',
          outcome: null,
          completed_outcome: 'ready',
          error: null,
          first_failed_node: null,
          nodes: [],
          returns: { availability: 'available', node_id: 'result', value: { change: CHANGE } },
          artifacts: { root: null, files: [], limitations: [] },
        },
      },
      created_at: '2026-11-16T10:30:00Z',
      event_order: 9,
    },
    {
      // A forge audit row naming the pull request, the shape `pr.ready` records.
      id: 'e0-audit',
      workflow_run_id: 'run-a',
      event_type: 'integration_operation',
      step_index: null,
      step_name: null,
      data: {
        integration: 'forge',
        operationId: 'op-1',
        operation: 'pr.ready',
        target: { repo: { host: 'forge.example', path: 'acme/web' }, number: 7 },
        plugin: { name: 'github', version: '1' },
        result: {
          operationId: 'op-1',
          ok: true,
          result: {
            op: 'pr.ready',
            value: {
              target: { repo: { host: 'forge.example', path: 'acme/web' }, number: 7 },
              outcome: 'applied',
              changed: true,
              pr: {
                repo: { host: 'forge.example', path: 'acme/web' },
                number: 7,
                schemaVersion: 1,
                url: CHANGE,
                head: 'feature',
                base: 'main',
                is_draft: false,
                state: 'open',
                head_repo: { host: 'forge.example', path: 'acme/web' },
                head_revision: 'a'.repeat(40),
                base_revision: 'b'.repeat(40),
                maintainer_can_modify: false,
              },
            },
          },
        },
        retries: 0,
        durationMs: 1,
      },
      created_at: '2026-11-16T10:29:00Z',
      event_order: 8,
    },
    {
      id: 'e1',
      workflow_run_id: 'run-b',
      event_type: 'node_started',
      step_index: null,
      step_name: 'build',
      data: {},
      created_at: '2026-11-16T11:00:00Z',
      event_order: 1,
    },
  ];
  const source: ItemReadSource = {
    // The branch each run recorded, as the host reads it from the run's isolation record.
    branchOf: async run => `branch-${run.id}`,
    store: {
      getItemRuns: async (projectKey, key) => {
        const item = items.find(entry => entry.key === key && entry.projectKey === projectKey);
        return item ? { item, runs: runs[key] ?? [], descendantIds: [] } : null;
      },
      listEventsForRuns: async ids =>
        new Map(ids.map(id => [id, events.filter(row => row.workflow_run_id === id)])),
      listAttentionQueueRows: async () => [],
      getWorkflowRun: async () => null,
      getWorkflowRunForAttention: async () => null,
      getCodebase: async () => null,
      getItem: async () => null,
      getItemMerge: async () => null,
      listSkippedItemStarts: async () => [],
      listQueuedItemStarts: async () => [],
      listItemAsks: async () => [],
      listItemRulings: async () => [],
      listItemLinks: async () => [],
      getResourceStartRequest: async () => null,
      getStartReceipt: async () => null,
    },
  };

  async function itemsApp(
    files: Record<string, unknown>,
    lookups: string[] = [],
    branchesSeen: string[][] = []
  ): Promise<OpenAPIHono> {
    const project = await projectWith(track, files);
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebase: async id => (id === 'cb-1' ? { cwd: project, projectKey: 'acme/web' } : null),
      itemsSource: source,
      changeMergeState: async (url, _audits, branches) => {
        lookups.push(url);
        branchesSeen.push([...(await branches())]);
        // No number from the forge: the one the run's audit row names stands.
        return { merged: true, mergedAt: '2026-11-17T01:00:00Z', number: null };
      },
    });
    return app;
  }
  const withView = {
    '.archon/packs/acme.kit.factory-view.json': {
      ...declaration('acme/kit', 'Kit factory'),
      itemTitle: { input: 'item' },
      change: { workflow: 'deliver', pointer: '/change' },
    },
  };

  test('the progress of each key asked, repeated or one; a key with no item is left out', async () => {
    const app = await itemsApp(withView);
    const response = await app.request('/api/factory/progress?codebaseId=cb-1&keys=2&keys=9');
    expect(response.status).toBe(200);
    const read = factoryProgressResponseSchema.parse(await response.json());
    expect(read.pack).toBe('acme/kit');
    expect(read.progress).toEqual({
      '2': {
        title: 'Item 2',
        running: {
          runId: 'run-b',
          workflow: 'deliver',
          step: 'build',
          startedAt: '2026-11-16T10:00:00.000Z',
        },
        round: null,
        returned: 0,
        change: null,
        runs: [{ runId: 'run-b', workflow: 'deliver', failedStep: null }],
      },
    });
    const one = await app.request('/api/factory/progress?codebaseId=cb-1&keys=1');
    const single = factoryProgressResponseSchema.parse(await one.json());
    expect(Object.keys(single.progress)).toEqual(['1']);
  });

  test('a change is looked up once across requests, through the cache the route shares', async () => {
    const lookups: string[] = [];
    const branchesSeen: string[][] = [];
    const app = await itemsApp(withView, lookups, branchesSeen);
    for (let request = 0; request < 2; request++) {
      const response = await app.request('/api/factory/progress?codebaseId=cb-1&keys=1&keys=2');
      const read = factoryProgressResponseSchema.parse(await response.json());
      expect(read.progress['1']?.change).toEqual({
        url: CHANGE,
        merged: true,
        mergedAt: '2026-11-17T01:00:00Z',
        // Named by the run's own forge audit row.
        number: 7,
      });
    }
    expect(lookups).toEqual([CHANGE]);
    // The lookup is handed the item's runs' recorded branches, for a change no audit row names.
    expect(branchesSeen).toEqual([['branch-run-a']]);
  });

  test('no keys, or more keys than a window page holds, is a 400', async () => {
    const app = await itemsApp(withView);
    expect((await app.request('/api/factory/progress?codebaseId=cb-1')).status).toBe(400);
    const many = Array.from({ length: 101 }, (_, i) => `keys=${String(i)}`).join('&');
    expect((await app.request(`/api/factory/progress?codebaseId=cb-1&${many}`)).status).toBe(400);
  });

  test('no applying view, or an unknown codebase, is a 404', async () => {
    const app = await itemsApp({});
    const none = await app.request('/api/factory/progress?codebaseId=cb-1&keys=1');
    expect(none.status).toBe(404);
    expect((await app.request('/api/factory/progress?codebaseId=missing&keys=1')).status).toBe(404);
  });
  test("one item: its read and progress, with each run's timeline facts", async () => {
    const app = await itemsApp(withView);
    const response = await app.request('/api/factory/item?codebaseId=cb-1&key=2');
    expect(response.status).toBe(200);
    const detail = factoryItemDetailResponseSchema.parse(await response.json());
    expect(detail.pack).toBe('acme/kit');
    expect(detail.item.item.key).toBe('2');
    expect(detail.item.progress?.running?.step).toBe('build');
    expect(detail.runs).toEqual([
      { runId: 'run-b', workflow: 'deliver', costUsd: null, step: 'build', rounds: null },
    ]);
  });

  test('the item route shares the merge cache with the progress route', async () => {
    const lookups: string[] = [];
    const app = await itemsApp(withView, lookups);
    await app.request('/api/factory/progress?codebaseId=cb-1&keys=1');
    const response = await app.request('/api/factory/item?codebaseId=cb-1&key=1');
    const detail = factoryItemDetailResponseSchema.parse(await response.json());
    expect(detail.item.progress?.change?.merged).toBe(true);
    expect(lookups).toEqual([CHANGE]);
  });

  test('a missing key is a 400; an unknown item, codebase or no applying view is a 404', async () => {
    const app = await itemsApp(withView);
    expect((await app.request('/api/factory/item?codebaseId=cb-1')).status).toBe(400);
    expect((await app.request('/api/factory/item?codebaseId=cb-1&key=9')).status).toBe(404);
    expect((await app.request('/api/factory/item?codebaseId=missing&key=1')).status).toBe(404);
    const viewless = await itemsApp({});
    expect((await viewless.request('/api/factory/item?codebaseId=cb-1&key=1')).status).toBe(404);
  });
});

describe('the merge-state cache', () => {
  const CHANGE = 'https://forge.example/acme/web/pull/7';
  const noBranches = async (): Promise<string[]> => [];
  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  test('one lookup in flight per change; its answer serves the next request', async () => {
    let lookups = 0;
    const state = changeStateCache({
      changeMergeState: async () => {
        lookups++;
        return { merged: false, mergedAt: null, number: null };
      },
    });
    const both = await Promise.all([state(CHANGE, [], noBranches), state(CHANGE, [], noBranches)]);
    expect(both).toEqual([
      { merged: false, mergedAt: null, number: null },
      { merged: false, mergedAt: null, number: null },
    ]);
    await state(CHANGE, [], noBranches);
    expect(lookups).toBe(1);
  });

  test('a slow first lookup answers pending within the wait, uncached, then fills the cache', async () => {
    let finish: (value: ChangeMergeState) => void = () => {};
    const state = changeStateCache({
      changeStateWaitMs: 10,
      changeMergeState: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    });
    expect(await state(CHANGE, [], noBranches)).toEqual({
      merged: 'pending',
      mergedAt: null,
      number: null,
    });
    // Still running: the next read waits on the same lookup and answers pending again.
    expect((await state(CHANGE, [], noBranches)).merged).toBe('pending');
    finish({ merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 7 });
    await settle();
    expect(await state(CHANGE, [], noBranches)).toEqual({
      merged: true,
      mergedAt: '2026-11-17T01:00:00Z',
      number: 7,
    });
  });

  test('an answer a minute old is served while it refreshes; a merge is kept', async () => {
    let clock = 0;
    let lookups = 0;
    const state = changeStateCache({
      now: () => clock,
      changeMergeState: async () =>
        lookups++ === 0
          ? { merged: false, mergedAt: null, number: null }
          : { merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 7 },
    });
    expect((await state(CHANGE, [], noBranches)).merged).toBe(false);
    clock = 59_999;
    expect((await state(CHANGE, [], noBranches)).merged).toBe(false);
    expect(lookups).toBe(1);
    clock = 60_000;
    expect((await state(CHANGE, [], noBranches)).merged).toBe(false);
    await settle();
    expect((await state(CHANGE, [], noBranches)).merged).toBe(true);
    clock = 10_000_000;
    await state(CHANGE, [], noBranches);
    expect(lookups).toBe(2);
  });

  test('a lookup that throws answers unknown, never rejects, and is cached', async () => {
    let lookups = 0;
    const state = changeStateCache({
      changeMergeState: async () => {
        lookups++;
        throw new Error('offline');
      },
    });
    expect(await state(CHANGE, [], noBranches)).toEqual({
      merged: 'unknown',
      mergedAt: null,
      number: null,
    });
    expect((await state(CHANGE, [], noBranches)).merged).toBe('unknown');
    expect(lookups).toBe(1);
  });
});

describe('GET /api/factory/workflow', () => {
  const track = trackTempRoots();
  const DELIVER = [
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
  ].join('\n');

  async function workflowApp(withWorkflow = true): Promise<OpenAPIHono> {
    const project = await projectWith(track, {
      '.archon/packs/kit.factory-view.json': declaration('kit', 'Kit factory'),
      ...(withWorkflow ? { '.archon/workflows/kit/deliver/deliver.yaml': DELIVER } : {}),
    });
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebase: async id => (id === 'cb-1' ? { cwd: project, projectKey: 'acme/web' } : null),
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
