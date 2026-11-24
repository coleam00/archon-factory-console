import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ChangeLookup, ChangeMergeState } from '@archon/adapters/forge-host';
import { getHomeWorkflowsPath } from '@archon/paths';
import { removeTempTree, trackTempRoots } from '@archon/paths/test-utils';
import { providerRegistry } from '@archon/providers';
import type { DiscoveriesSource } from '@archon/workflows/factory-discoveries';
import type { ItemReadSource } from '@archon/workflows/item-read';
import type { WorkflowEventRow } from '@archon/workflows/schemas/workflow-event';
import type { WorkflowItem, WorkflowRun } from '@archon/workflows/schemas/workflow-run';
import { discoverWorkflows } from '@archon/workflows/workflow-discovery';
import type { WorkflowLoadResult } from '@archon/workflows/schemas/workflow';
import { changeStateCache, registerFactoryRoutes, type FactoryRouteDeps } from './api.factory';
import {
  factoryDiscoveriesResponseSchema,
  factoryItemDetailResponseSchema,
  factoryPackSettingsResponseSchema,
  factoryPacksResponseSchema,
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
  codebases: async () => [],
  loadConfig: async () => ({
    assistant: undefined,
    commands: {},
    assistants: { claude: {}, codex: {} },
  }),
  ranWorkflows: async () => new Set(),
  itemsSource: {} as ItemReadSource,
  discoveriesSource: {} as DiscoveriesSource,
  changeMergeState: async () => {
    throw new Error('no change is looked up here');
  },
  discoverWorkflows: async () => {
    throw new Error('no workflow is discovered here');
  },
};

const PR7 = 'https://forge.example/acme/web/pull/7';
/** A forge audit row naming pull request 7 at `PR7`, the shape `pr.ready` records. */
const PR7_AUDIT = {
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
          url: PR7,
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
};

const REMOTE = 'https://forge.example/acme/web.git';

/** The routes over one project, `cb-1`, holding `files`; `deps` replaces what a test reads. */
async function factoryApp(
  track: (path: string) => string,
  files: Record<string, unknown>,
  deps: Partial<FactoryRouteDeps> = {}
): Promise<{ app: OpenAPIHono; project: string }> {
  const project = await projectWith(track, files);
  const app = new OpenAPIHono();
  registerFactoryRoutes(app, {
    ...noItems,
    codebase: async id =>
      id === 'cb-1' ? { cwd: project, projectKey: 'acme/web', remote: REMOTE } : null,
    ...deps,
  });
  return { app, project };
}

/** An overview declaration of two cards for `pack`, with any further fields in `extra`. */
const overview = (
  pack: string,
  title: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({
  version: 1,
  pack,
  title,
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
  ...extra,
});

/** The terminal record a completed run records, its declared result `value` from `node`. */
const completed = (
  runId: string,
  node: string,
  value: unknown,
  at: string,
  order: number
): WorkflowEventRow => ({
  id: `${runId}-completed`,
  workflow_run_id: runId,
  event_type: 'workflow_completed',
  step_index: null,
  step_name: null,
  data: {
    terminal_record: {
      run_id: runId,
      status: 'completed',
      outcome: null,
      completed_outcome: 'ready',
      error: null,
      first_failed_node: null,
      nodes: [],
      returns: { availability: 'available', node_id: node, value },
      artifacts: { root: null, files: [], limitations: [] },
    },
  },
  created_at: at,
  event_order: order,
});

describe('GET /api/factory/views', () => {
  const track = trackTempRoots();
  const file = '.archon/packs/acme.kit.factory-view.json';
  const views = async (files: Record<string, unknown>) => {
    const { app, project } = await factoryApp(track, files);
    const response = await app.request('/api/factory/views?codebaseId=cb-1');
    expect(response.status).toBe(200);
    return { listing: factoryViewsSchema.parse(await response.json()), project };
  };

  test("a project's own file applies with no runs, naming its pack key and run names", async () => {
    const { listing, project } = await views({ [file]: declaration('acme/kit', 'Kit factory') });
    expect(
      listing.views.map(v => [v.pack, v.source, v.path, v.declaration.title, v.packKey, v.runNames])
    ).toEqual([
      [
        'acme/kit',
        'project-file',
        join(project, '.archon', 'packs', 'acme.kit.factory-view.json'),
        'Kit factory',
        'acme.kit',
        { deliver: 'acme/kit:deliver' },
      ],
    ]);
  });

  test('a malformed project file is listed under errors with its path', async () => {
    const { listing, project } = await views({ [file]: '{ "version": ' });
    const path = join(project, '.archon', 'packs', 'acme.kit.factory-view.json');
    expect(listing.views).toEqual([]);
    expect(listing.errors).toEqual([
      { pack: 'acme.kit', source: 'project-file', path, error: expect.stringContaining(path) },
    ]);
  });
});

describe('GET /api/factory/packs', () => {
  const track = trackTempRoots();
  const viewFile = '.archon/packs/acme.kit.factory-view.json';
  const overviewFile = '.archon/packs/acme.kit.factory-overview.json';
  async function read(
    projects: { id: string; name: string; files: Record<string, unknown>; config?: 'throws' }[]
  ): Promise<{ status: number; body: unknown; cwds: Map<string, string> }> {
    const cwds = new Map<string, string>();
    for (const project of projects) cwds.set(project.id, await projectWith(track, project.files));
    const app = new OpenAPIHono();
    registerFactoryRoutes(app, {
      ...noItems,
      codebases: async () =>
        projects.map(({ id, name }) => ({ id, name, cwd: cwds.get(id) ?? '' })),
      loadConfig: async cwd => {
        if (projects.find(p => cwds.get(p.id) === cwd)?.config === 'throws')
          throw new Error('config is broken');
        return noItems.loadConfig(cwd);
      },
    });
    const response = await app.request('/api/factory/packs');
    return { status: response.status, body: await response.json(), cwds };
  }

  test('a project file is read from the first project by name, and the projects listed', async () => {
    const { body, cwds } = await read(
      [
        ['cb-2', 'zeta', 'Zeta'],
        ['cb-1', 'alpha', 'Alpha'],
      ].map(([id = '', name = '', title = '']) => ({
        id,
        name,
        files: {
          [viewFile]: declaration('acme/kit', 'Kit'),
          [overviewFile]: overview('acme/kit', title),
        },
      }))
    );
    const packs = factoryPacksResponseSchema.parse(body);
    expect(packs.packs).toHaveLength(1);
    const [pack] = packs.packs;
    expect([pack?.pack, pack?.key, pack?.overview?.declaration.title]).toEqual([
      'acme/kit',
      'acme.kit',
      'Alpha',
    ]);
    expect(pack?.overview?.path).toBe(
      join(cwds.get('cb-1') ?? '', '.archon', 'packs', 'acme.kit.factory-overview.json')
    );
    expect(pack?.readFrom).toEqual({ codebaseId: 'cb-1', name: 'alpha' });
    expect(pack?.projects).toEqual([
      { codebaseId: 'cb-1', name: 'alpha' },
      { codebaseId: 'cb-2', name: 'zeta' },
    ]);
  });

  test('a project that cannot be read is listed, and the other packs remain', async () => {
    const { status, body } = await read([
      { id: 'cb-1', name: 'broken', files: {}, config: 'throws' },
      { id: 'cb-2', name: 'web', files: { [overviewFile]: overview('acme/kit', 'Kit') } },
    ]);
    expect(status).toBe(200);
    const packs = factoryPacksResponseSchema.parse(body);
    expect(packs.packs.map(p => p.readFrom?.name)).toEqual(['web']);
    expect(packs.unreadProjects).toEqual([
      { codebaseId: 'cb-1', name: 'broken', error: 'config is broken' },
    ]);
  });
});

describe('GET /api/factory/pack-settings', () => {
  const track = trackTempRoots();
  const sections = [
    {
      id: 'ahead',
      eyebrow: 'Gates',
      title: 'What may go ahead',
      kind: 'gate' as const,
      icon: 'gavel' as const,
    },
  ];
  const kit = overview('kit', 'Kit', {
    settings: {
      land_policy: { points_to: 'policy', shadow: true, section: 'ahead', when_live: 'Would land' },
    },
    setting_sections: sections,
  });

  async function read(query: string): Promise<{ status: number; body: unknown }> {
    const files = {
      '.archon/packs/kit.factory-view.json': declaration('kit', 'Kit factory'),
      '.archon/packs/kit.yaml': 'settings:\n  land_policy: docs/land.md\n  colour: red\n',
      'docs/land.md': '# Land',
    };
    const project = await projectWith(track, files);
    const { app } = await factoryApp(
      track,
      {},
      {
        codebases: async () => [{ id: 'cb-1', name: 'web', cwd: project }],
      }
    );
    const response = await app.request(`/api/factory/pack-settings?pack=${query}`);
    return { status: response.status, body: await response.json() };
  }

  test("reads a home pack's declaration and each project's values", async () => {
    // A global folder pack: the scratch home every test process starts with.
    const pack = join(getHomeWorkflowsPath(), 'kit');
    await mkdir(join(pack, '.pack'), { recursive: true });
    await mkdir(join(pack, '.shared'), { recursive: true });
    await writeFile(
      join(pack, '.pack', 'pack.yaml'),
      'inputs:\n  land_policy:\n    default: ""\n    description: Shadow only.\n  command: {}\n'
    );
    await writeFile(join(pack, '.shared', 'factory-overview.json'), JSON.stringify(kit));
    try {
      const { status, body } = await read('kit');
      expect(status).toBe(200);
      const settings = factoryPackSettingsResponseSchema.parse(body);
      expect(settings.declaration).toEqual({ path: join(pack, '.pack', 'pack.yaml'), error: null });
      expect(
        settings.settings.map(s => [s.name, s.shadow, s.pointsTo, s.section, s.whenLive])
      ).toEqual([
        ['land_policy', true, 'policy', 'ahead', 'Would land'],
        ['command', false, null, null, null],
      ]);
      expect(settings.sections).toEqual(sections);
      const [project] = settings.projects;
      expect(project?.name).toBe('web');
      const land = project?.values.land_policy;
      expect(land?.state === 'set' ? [land.file?.display, land.file?.status] : null).toEqual([
        'docs/land.md',
        'found',
      ]);
      expect(project?.undeclared).toEqual([{ name: 'colour', value: 'red' }]);
    } finally {
      await removeTempTree(pack);
    }
  });
});

describe('GET /api/factory/discoveries', () => {
  const track = trackTempRoots();
  const viewFile = '.archon/packs/acme.kit.factory-view.json';
  const discoveries = {
    workflow: 'discoveries',
    shadow: true,
    filed: '/filed',
    held: '/held',
    dropped: '/dropped',
    entry: { title: '/title', kind: '/kind' },
  };
  // A shadow drain is declared a shadow step too; the two must agree.
  const shadows = [
    {
      workflow: 'discoveries',
      node: 'drain',
      label: 'What it would file',
      reads: 'lists',
      lists: [{ pointer: '/filed', words: 'would file' }],
    },
  ];
  // One item, one drain: no other source of the store is read.
  const item: WorkflowItem = { id: 'i-1', projectKey: 'acme/web', key: '1' };
  const drain = {
    id: 'd-1',
    workflow_name: 'acme/kit:discoveries',
    status: 'completed',
    metadata: {},
    started_at: new Date('2026-11-17T10:00:00Z'),
    completed_at: new Date('2026-11-17T10:05:00Z'),
  } as unknown as WorkflowRun;
  const drained = completed(
    'd-1',
    'drain',
    {
      filed: [{ title: 'A finding', kind: 'defect' }],
      held: [{ what: 'x', until: 'y' }],
      dropped: [],
    },
    '2026-11-17T10:05:00Z',
    1
  );
  const source = {
    listItemsInWindow: async () => [item],
    getItemRuns: async () => ({ item, runs: [drain], descendantIds: [] }),
    listEventsForRuns: async () => new Map([['d-1', [drained]]]),
  } as unknown as DiscoveriesSource;

  async function request(
    files: Record<string, unknown>
  ): Promise<{ status: number; body: unknown }> {
    const { app } = await factoryApp(track, files, { discoveriesSource: source });
    const response = await app.request('/api/factory/discoveries?codebaseId=cb-1');
    return { status: response.status, body: await response.json() };
  }

  test('what the drains decided, at the pointers the view declares', async () => {
    const { status, body } = await request({
      [viewFile]: { ...declaration('acme/kit', 'Kit factory'), discoveries, shadows },
    });
    expect(status).toBe(200);
    const read = factoryDiscoveriesResponseSchema.parse(body);
    expect(read).toMatchObject({ pack: 'acme/kit', shadow: true, held: 1, dropped: 0 });
    expect(read.findings.map(f => [f.title, f.kind, f.from.key, f.coveredBy])).toEqual([
      ['A finding', 'defect', '1', null],
    ]);
  });

  test('a view that declares no discoveries is a 404 saying so', async () => {
    expect(await request({ [viewFile]: declaration('acme/kit', 'Kit factory') })).toEqual({
      status: 404,
      body: { error: 'This factory view declares no discoveries' },
    });
  });
});

// One project's three items, their runs and events, as the item reader's store holds them.
const items: [WorkflowItem, WorkflowItem, WorkflowItem] = [
  { id: 'item-a', projectKey: 'acme/web', key: '1' },
  { id: 'item-b', projectKey: 'acme/web', key: '2' },
  { id: 'item-c', projectKey: 'acme/web', key: '3' },
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
  '2': [run('run-b', items[1], { status: 'running', completed_at: null, completed_outcome: null })],
  // A deliver whose result names an empty change URL.
  '3': [run('run-c', items[2], {})],
};
const CHANGE = 'https://forge.example/acme/web/pull/7';
const BRANCH_CHANGE = 'https://forge.example/acme/web/pull/8';
const events: WorkflowEventRow[] = [
  // The shape a completed run records: its terminal record carries the declared result.
  completed('run-a', 'result', { change: CHANGE }, '2026-11-16T10:30:00Z', 9),
  completed('run-c', 'result', { change: '' }, '2026-11-16T10:30:00Z', 9),
  {
    // A forge audit row naming the pull request, the shape `pr.ready` records.
    id: 'e0-audit',
    workflow_run_id: 'run-a',
    event_type: 'integration_operation',
    step_index: null,
    step_name: null,
    data: PR7_AUDIT,
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
    getItemLanding: async () => null,
    listOpenItemWaits: async () => [],
    listSkippedItemStarts: async itemIds => new Map(itemIds.map(id => [id, []])),
    listQueuedItemStarts: async itemIds => new Map(itemIds.map(id => [id, []])),
    getInstallHold: async () => null,
    getRunLimit: async () => null,
    listHeldItemStarts: async () => [],
    listItemAsks: async () => [],
    listItemRulings: async () => [],
    listItemLinks: async () => [],
    getResourceStartRequest: async () => null,
    listStartReceiptSources: async () => new Map(),
  },
};
const withView = {
  '.archon/packs/acme.kit.factory-view.json': {
    ...declaration('acme/kit', 'Kit factory'),
    itemTitle: { input: 'item' },
    change: { workflow: 'deliver', pointer: '/change' },
  },
};

describe('GET /api/factory/progress and /api/factory/item', () => {
  const track = trackTempRoots();

  async function itemsApp(lookups: unknown[] = [], branchesSeen: string[][] = []) {
    const { app } = await factoryApp(track, withView, {
      itemsSource: source,
      changeMergeState: async (lookup, branches) => {
        lookups.push(lookup.kind === 'url' ? lookup.url : lookup);
        branchesSeen.push([...(await branches())]);
        return lookup.kind === 'url'
          ? // No number from the forge: the one the run's audit row names stands.
            { url: null, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: null }
          : { url: BRANCH_CHANGE, merged: false, mergedAt: null, number: 8 };
      },
    });
    return app;
  }

  test('the progress of each key asked, repeated or one; a key with no item is left out', async () => {
    const app = await itemsApp();
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
        partOf: null,
        returned: 0,
        change: null,
        runs: [{ runId: 'run-b', workflow: 'deliver', failedStep: null }],
        shadows: [],
        parked: null,
        awaits: null,
      },
    });
    expect(read.members).toEqual({ '2': [] });
    const one = await app.request('/api/factory/progress?codebaseId=cb-1&keys=1');
    const single = factoryProgressResponseSchema.parse(await one.json());
    expect(Object.keys(single.progress)).toEqual(['1']);
  });

  test('a change is looked up once across requests and both routes; an empty change URL asks the branches', async () => {
    const lookups: unknown[] = [];
    const branchesSeen: string[][] = [];
    const app = await itemsApp(lookups, branchesSeen);
    for (let request = 0; request < 2; request++) {
      const response = await app.request('/api/factory/progress?codebaseId=cb-1&keys=1&keys=3');
      const read = factoryProgressResponseSchema.parse(await response.json());
      expect(read.progress['1']?.change).toEqual({
        url: CHANGE,
        merged: true,
        mergedAt: '2026-11-17T01:00:00Z',
        // Named by the run's own forge audit row.
        number: 7,
      });
      // Item 3's run named an empty URL: the PR the forge finds on its branches in the remote.
      expect(read.progress['3']?.change).toEqual({
        url: BRANCH_CHANGE,
        merged: false,
        mergedAt: null,
        number: 8,
      });
    }
    const detail = await app.request('/api/factory/item?codebaseId=cb-1&key=1');
    expect(
      factoryItemDetailResponseSchema.parse(await detail.json()).item.progress?.change?.merged
    ).toBe(true);
    expect(lookups).toHaveLength(2);
    expect(lookups).toEqual(expect.arrayContaining([CHANGE, { kind: 'branch', remote: REMOTE }]));
    // The lookup is handed the item's runs' recorded branches.
    expect(branchesSeen).toEqual(expect.arrayContaining([['branch-run-a'], ['branch-run-c']]));
  });

  test("one item: its read and progress, with each run's story facts", async () => {
    const app = await itemsApp();
    const response = await app.request('/api/factory/item?codebaseId=cb-1&key=2');
    expect(response.status).toBe(200);
    const detail = factoryItemDetailResponseSchema.parse(await response.json());
    expect(detail.pack).toBe('acme/kit');
    expect(detail.item.item.key).toBe('2');
    expect(detail.item.progress?.running?.step).toBe('build');
    expect(detail.runs).toEqual([
      {
        runId: 'run-b',
        workflow: 'deliver',
        costUsd: null,
        step: 'build',
        rounds: null,
        shadows: [],
        // Still running: no change named and nothing said yet; its one step start.
        change: null,
        said: null,
        models: [],
        steps: [{ node: 'build', startedAt: '2026-11-16T11:00:00.000Z' }],
      },
    ]);
  });
});

describe('the merge-state cache', () => {
  const noBranches = async (): Promise<string[]> => [];
  const change = { kind: 'url' as const, url: CHANGE, audits: [] };
  const settle = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 0));
  };

  test('a slow first lookup answers pending within the wait, uncached, then fills the cache', async () => {
    let finish: (value: ChangeMergeState) => void = () => {};
    const state = changeStateCache({
      changeStateWaitMs: 10,
      changeMergeState: () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    });
    const none = { url: CHANGE, mergedAt: null, number: null };
    expect(await state(change, noBranches, null, null)).toEqual({ ...none, merged: 'pending' });
    // Still running: the next read waits on the same lookup and answers pending again.
    expect((await state(change, noBranches, null, null)).merged).toBe('pending');
    finish({ url: CHANGE, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 7 });
    await settle();
    expect(await state(change, noBranches, null, null)).toEqual({
      url: CHANGE,
      merged: true,
      mergedAt: '2026-11-17T01:00:00Z',
      number: 7,
    });
  });

  test('a lookup that throws answers unknown, never rejects, and is cached', async () => {
    let lookups = 0;
    const state = changeStateCache({
      changeMergeState: async () => {
        lookups++;
        throw new Error('offline');
      },
    });
    expect(await state(change, noBranches, null, null)).toEqual({
      ...{ url: CHANGE, mergedAt: null, number: null },
      merged: 'unknown',
    });
    expect((await state(change, noBranches, null, null)).merged).toBe('unknown');
    expect(lookups).toBe(1);
  });

  test('runs that named no URL get an answer each, asked in the remote they are given', async () => {
    const asked: ChangeLookup[] = [];
    const state = changeStateCache({
      changeMergeState: async lookup => {
        asked.push(lookup);
        const number = asked.length === 1 ? 8 : 9;
        return { url: `${CHANGE.slice(0, -1)}${number}`, merged: true, mergedAt: null, number };
      },
    });
    const branches = async (): Promise<string[]> => ['a'];
    const of = (run: string) => state({ kind: 'branch', run }, branches, 'remote-1', null);
    const [first, second] = [await of('run-1'), await of('run-2')];
    expect([first.number, second.number, first.url]).toEqual([8, 9, `${CHANGE.slice(0, -1)}8`]);
    expect((await of('run-1')).number).toBe(8);
    expect(asked).toEqual([
      { kind: 'branch', remote: 'remote-1' },
      { kind: 'branch', remote: 'remote-1' },
    ]);
  });

  const recorded = { change: CHANGE, at: '2026-11-17T01:00:00.000Z' };
  const fromRecord = { url: CHANGE, merged: true, mergedAt: recorded.at };

  test('a recorded merge whose audit rows name its pull request never asks the change host', async () => {
    let lookups = 0;
    const state = changeStateCache({
      changeMergeState: async () => {
        lookups++;
        return { url: null, merged: false, mergedAt: null, number: null };
      },
    });
    const audited = { ...change, audits: [PR7_AUDIT] };
    expect(await state(audited, noBranches, null, recorded)).toEqual({ ...fromRecord, number: 7 });
    expect(lookups).toBe(0);
  });
});

/** Workflow discovery as runs see it, without the bundled defaults. */
const discover = (cwd: string): Promise<WorkflowLoadResult> =>
  discoverWorkflows(cwd, { providers: providerRegistry, loadDefaults: false });

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
  const viewFile = '.archon/packs/kit.factory-view.json';
  const deliverFile = '.archon/workflows/kit/deliver/deliver.yaml';

  async function read(
    files: Record<string, unknown>
  ): Promise<{ status: number; body: { error?: string } }> {
    const { app } = await factoryApp(track, files, { discoverWorkflows: discover });
    const response = await app.request('/api/factory/workflow?codebaseId=cb-1&workflow=deliver');
    return { status: response.status, body: (await response.json()) as { error?: string } };
  }

  test("returns the steps of a workflow the project's view names", async () => {
    const { status, body } = await read({
      [viewFile]: declaration('kit', 'Kit factory'),
      [deliverFile]: DELIVER,
    });
    expect(status).toBe(200);
    const workflow = factoryWorkflowSchema.parse(body);
    expect([workflow.name, workflow.runName]).toEqual(['deliver', 'deliver']);
    expect(workflow.groups.map(g => [g.id, g.kind, g.maxRounds])).toEqual([['rounds', 'loop', 2]]);
    expect(workflow.steps.map(s => [s.key, s.kind, s.yaml])).toEqual([
      ['rounds.fix', 'bash', 'id: fix\nbash: echo fixed'],
    ]);
  });

  test('a workflow the view names but the project lacks returns 404 naming the pack', async () => {
    const { status, body } = await read({ [viewFile]: declaration('kit', 'Kit factory') });
    expect(status).toBe(404);
    // Read by a person on a stage: it names the pack and the workflow.
    expect(body.error).toContain('kit');
    expect(body.error).toContain('deliver');
  });

  test.each([
    ['retired', ['deliver'], ' It was retired; the items it worked still show their runs.'],
    ['missing from a pack whose other workflows are here', undefined, ''],
  ])('a %s workflow returns 404 saying the pack has no such workflow', async (_, retired, why) => {
    // Build lists `deliver` and `next`; `next` is on disk and `deliver` is not.
    const build = { id: 'build', label: 'Build', blurb: 'Builds.', group: 'build' };
    const { status, body } = await read({
      [viewFile]: {
        ...declaration('kit', 'Kit factory'),
        stages: [
          { ...build, workflows: ['deliver', 'next'] },
          { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
        ],
        ...(retired === undefined ? {} : { retired }),
      },
      '.archon/workflows/kit/next/next.yaml': DELIVER.replace('name: deliver', 'name: next'),
    });
    expect([status, body.error]).toEqual([404, `This pack has no workflow named deliver.${why}`]);
  });

  test('reads share one discovery; a workflow missing from it is discovered again before the 404', async () => {
    let discoveries = 0;
    const { app, project } = await factoryApp(
      track,
      { [viewFile]: declaration('kit', 'Kit factory') },
      {
        discoverWorkflows: cwd => {
          discoveries++;
          return discover(cwd);
        },
      }
    );
    const request = (): Promise<Response> =>
      Promise.resolve(app.request('/api/factory/workflow?codebaseId=cb-1&workflow=deliver'));
    expect((await request()).status).toBe(404);
    // The pack is installed after the 404, and the person reloads as it told them to.
    await mkdir(join(project, '.archon/workflows/kit/deliver'), { recursive: true });
    await writeFile(join(project, deliverFile), DELIVER);
    discoveries = 0;
    expect((await request()).status).toBe(200);
    expect(discoveries).toBe(1);
    expect((await Promise.all([request(), request()])).map(response => response.status)).toEqual([
      200, 200,
    ]);
    expect(discoveries).toBe(1);
  });
});

describe('a request the routes cannot answer', () => {
  const track = trackTempRoots();
  const many = Array.from({ length: 101 }, (_, i) => `keys=${String(i)}`).join('&');

  test.each([
    // A query the route cannot take: no keys, more keys than a window page holds, no key.
    ['view', '/api/factory/progress?codebaseId=cb-1', 400],
    ['view', `/api/factory/progress?codebaseId=cb-1&${many}`, 400],
    ['view', '/api/factory/item?codebaseId=cb-1', 400],
    // An unknown codebase, item, workflow or pack.
    ['view', '/api/factory/views?codebaseId=missing', 404],
    ['view', '/api/factory/progress?codebaseId=missing&keys=1', 404],
    ['view', '/api/factory/item?codebaseId=missing&key=1', 404],
    ['view', '/api/factory/item?codebaseId=cb-1&key=9', 404],
    ['view', '/api/factory/workflow?codebaseId=missing&workflow=deliver', 404],
    ['view', '/api/factory/workflow?codebaseId=cb-1&workflow=other', 404],
    ['view', '/api/factory/pack-settings?pack=nope', 404],
    // No view applies to the project.
    ['no view', '/api/factory/progress?codebaseId=cb-1&keys=1', 404],
    ['no view', '/api/factory/item?codebaseId=cb-1&key=1', 404],
    ['no view', '/api/factory/discoveries?codebaseId=cb-1', 404],
  ] as const)('%s: %s is a %i', async (files, path, status) => {
    const { app } = await factoryApp(track, files === 'view' ? withView : {}, {
      itemsSource: source,
      discoverWorkflows: discover,
    });
    expect((await app.request(path)).status).toBe(status);
  });
});
