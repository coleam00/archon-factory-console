import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { trackTempRoots } from '@archon/paths/test-utils';
import type { ItemReadSource } from '@archon/workflows/item-read';
import type { WorkflowEventRow } from '@archon/workflows/schemas/workflow-event';
import type { WorkflowItem, WorkflowRun } from '@archon/workflows/schemas/workflow-run';
import { changeStateCache, registerFactoryRoutes, type FactoryRouteDeps } from './api.factory';
import { factoryItemsPageResponseSchema, factoryViewsSchema } from './schemas/factory.schemas';

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
  map: { cards: [{ stage: 'build', col: 1, row: 1 }], arrows: [] },
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
  listProjectItems: async () => [],
  changeMergeState: async () => {
    throw new Error('no change is looked up here');
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

  test('an unknown codebase returns 404', async () => {
    const { app } = await factoryApp({});
    const response = await app.request('/api/factory/views?codebaseId=missing');
    expect(response.status).toBe(404);
  });
});

describe('GET /api/factory/items', () => {
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
  const events: WorkflowEventRow[] = [
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
    branchOf: async () => null,
    store: {
      getItemRuns: async (_projectKey, key) => {
        const item = items.find(entry => entry.key === key);
        return item ? { item, runs: runs[key] ?? [], descendantIds: [] } : null;
      },
      listEventsForRuns: async ids =>
        new Map(ids.map(id => [id, events.filter(row => row.workflow_run_id === id)])),
      listAttentionQueueRows: async () => [],
      getWorkflowRun: async () => null,
      getWorkflowRunForAttention: async () => null,
      getCodebase: async () => null,
      getItem: async () => null,
      listItemAsks: async () => [],
      listItemRulings: async () => [],
      listItemLinks: async () => [],
      getResourceStartRequest: async () => null,
      getStartReceipt: async () => null,
    },
  };

  async function itemsApp(files: Record<string, unknown>): Promise<OpenAPIHono> {
    const project = await projectWith(track, files);
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebase: async id => (id === 'cb-1' ? { cwd: project, projectKey: 'acme/web' } : null),
      itemsSource: source,
      listProjectItems: async () => [
        { id: 'item-a', key: '1', activityAt: '2026-11-16T10:30:00.000Z' },
        { id: 'item-b', key: '2', activityAt: '2026-11-16T11:00:00.000Z' },
      ],
    });
    return app;
  }
  const withView = {
    '.archon/packs/acme.kit.factory-view.json': {
      ...declaration('acme/kit', 'Kit factory'),
      itemTitle: { input: 'item' },
    },
  };

  test("a page of the project's items, newest activity first, each with its progress", async () => {
    const app = await itemsApp(withView);
    const response = await app.request('/api/factory/items?codebaseId=cb-1&limit=1');
    expect(response.status).toBe(200);
    const first = factoryItemsPageResponseSchema.parse(await response.json());
    expect(first.pack).toBe('acme/kit');
    expect(first.items.map(entry => [entry.item.key, entry.runs.length])).toEqual([['2', 1]]);
    expect(first.items[0]?.progress).toEqual({
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
    });
    const next = await app.request(
      `/api/factory/items?codebaseId=cb-1&after=${encodeURIComponent(first.next ?? '')}`
    );
    const second = factoryItemsPageResponseSchema.parse(await next.json());
    expect(second.items.map(entry => entry.item.key)).toEqual(['1']);
    expect(second.next).toBeNull();
  });

  test('a cursor that is not one is a 400; a limit out of range is refused', async () => {
    const app = await itemsApp(withView);
    expect((await app.request('/api/factory/items?codebaseId=cb-1&after=nope')).status).toBe(400);
    expect((await app.request('/api/factory/items?codebaseId=cb-1&limit=101')).status).toBe(400);
  });

  test('no applying view, or an unknown codebase, is a 404', async () => {
    const app = await itemsApp({});
    const none = await app.request('/api/factory/items?codebaseId=cb-1');
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ error: 'No factory view applies to this project' });
    expect((await app.request('/api/factory/items?codebaseId=missing')).status).toBe(404);
  });
});

describe('the merge-state cache', () => {
  const CHANGE = 'https://forge.example/acme/web/pull/7';
  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  test('one lookup in flight per change; its answer serves the next request', async () => {
    let lookups = 0;
    const state = changeStateCache({
      changeMergeState: async () => {
        lookups++;
        return { merged: false, mergedAt: null };
      },
    });
    const both = await Promise.all([state(CHANGE, []), state(CHANGE, [])]);
    expect(both).toEqual([
      { merged: false, mergedAt: null },
      { merged: false, mergedAt: null },
    ]);
    await state(CHANGE, []);
    expect(lookups).toBe(1);
  });

  test('a slow first lookup answers unknown within the wait, then fills the cache', async () => {
    let finish: (value: { merged: boolean; mergedAt: string | null }) => void = () => {};
    const state = changeStateCache({
      changeStateWaitMs: 10,
      changeMergeState: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    });
    expect(await state(CHANGE, [])).toEqual({ merged: 'unknown', mergedAt: null });
    finish({ merged: true, mergedAt: '2026-11-17T01:00:00Z' });
    await settle();
    expect(await state(CHANGE, [])).toEqual({ merged: true, mergedAt: '2026-11-17T01:00:00Z' });
  });

  test('an answer a minute old is served while it refreshes; a merge is kept', async () => {
    let clock = 0;
    let lookups = 0;
    const state = changeStateCache({
      now: () => clock,
      changeMergeState: async () =>
        lookups++ === 0
          ? { merged: false, mergedAt: null }
          : { merged: true, mergedAt: '2026-11-17T01:00:00Z' },
    });
    expect((await state(CHANGE, [])).merged).toBe(false);
    clock = 59_999;
    expect((await state(CHANGE, [])).merged).toBe(false);
    expect(lookups).toBe(1);
    clock = 60_000;
    expect((await state(CHANGE, [])).merged).toBe(false);
    await settle();
    expect((await state(CHANGE, [])).merged).toBe(true);
    clock = 10_000_000;
    await state(CHANGE, []);
    expect(lookups).toBe(2);
  });

  test('a lookup that throws answers unknown and never rejects', async () => {
    const state = changeStateCache({
      changeMergeState: async () => {
        throw new Error('offline');
      },
    });
    expect(await state(CHANGE, [])).toEqual({ merged: 'unknown', mergedAt: null });
  });
});
