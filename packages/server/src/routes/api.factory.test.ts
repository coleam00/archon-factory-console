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
import { registerFactoryRoutes, type FactoryRouteDeps } from './api.factory';
import {
  factoryDiscoveriesResponseSchema,
  factoryItemDetailResponseSchema,
  factoryPackSettingsResponseSchema,
  factoryPacksResponseSchema,
  factoryProgressResponseSchema,
  factoryViewsSchema,
  factoryWorkflowSchema,
} from './schemas/factory.schemas';

const track = trackTempRoots();

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

async function projectWith(files: Record<string, unknown>): Promise<string> {
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

const REMOTE = 'https://forge.example/acme/web.git';

/**
 * The routes over a project holding `files`, registered as codebase `cb-1` (remote `REMOTE`).
 * Each call is its own app, so its own caches. `deps` replaces what a test reads.
 */
async function appFor(
  files: Record<string, unknown> = {},
  deps: Partial<FactoryRouteDeps> | ((project: string) => Partial<FactoryRouteDeps>) = {}
): Promise<{ app: OpenAPIHono; project: string }> {
  const project = await projectWith(files);
  const app = new OpenAPIHono();
  registerFactoryRoutes(app, {
    ...noItems,
    codebase: async id =>
      id === 'cb-1' ? { cwd: project, projectKey: 'acme/web', remote: REMOTE } : null,
    ...(typeof deps === 'function' ? deps(project) : deps),
  });
  return { app, project };
}

const get = async (app: OpenAPIHono, path: string): Promise<{ status: number; body: unknown }> => {
  const response = await app.request(path);
  return { status: response.status, body: await response.json() };
};

const VIEW_FILE = '.archon/packs/acme.kit.factory-view.json';

describe('GET /api/factory/views', () => {
  const views = async (app: OpenAPIHono) => {
    const { status, body } = await get(app, '/api/factory/views?codebaseId=cb-1');
    expect(status).toBe(200);
    return factoryViewsSchema.parse(body);
  };

  test("a project's own file applies with no runs, naming its pack key and run names", async () => {
    const { app, project } = await appFor({ [VIEW_FILE]: declaration('acme/kit', 'Kit factory') });
    const listing = await views(app);
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

  test("a pack's own view applies only once the project ran a workflow it names", async () => {
    const files = {
      '.archon/workflows/factory/.shared/factory-view.json': declaration('factory', 'F'),
    };
    const asked: string[][] = [];
    const ran = (names: string[]) => ({
      ranWorkflows: async (id: string, workflows: readonly string[]) => {
        asked.push([id, ...workflows]);
        return new Set(names);
      },
    });
    const unrun = await appFor(files, ran([]));
    expect((await views(unrun.app)).views.find(v => v.pack === 'factory')).toBeUndefined();
    expect(asked).toEqual([['cb-1', 'deliver']]);
    const run = await appFor(files, ran(['deliver']));
    expect((await views(run.app)).views.find(v => v.pack === 'factory')?.source).toBe('project');
  });

  test('a malformed project file is listed under errors with its path', async () => {
    const { app, project } = await appFor({ [VIEW_FILE]: '{ "version": ' });
    const listing = await views(app);
    const path = join(project, '.archon', 'packs', 'acme.kit.factory-view.json');
    expect(listing.views).toEqual([]);
    expect(listing.errors).toEqual([
      { pack: 'acme.kit', source: 'project-file', path, error: expect.stringContaining(path) },
    ]);
  });
});

/** An overview declaration of `pack`, two cards and their edges. */
const overview = (pack: string, title: string) => ({
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
});

describe('GET /api/factory/packs', () => {
  const viewFile = '.archon/packs/acme.kit.factory-view.json';
  const overviewFile = '.archon/packs/acme.kit.factory-overview.json';

  async function read(
    projects: { id: string; name: string; files: Record<string, unknown>; config?: 'throws' }[]
  ): Promise<{ status: number; body: unknown; cwds: Map<string, string> }> {
    const cwds = new Map<string, string>();
    for (const project of projects) cwds.set(project.id, await projectWith(project.files));
    const { app } = await appFor(
      {},
      {
        codebases: async () =>
          projects.map(({ id, name }) => ({ id, name, cwd: cwds.get(id) ?? '' })),
        loadConfig: async cwd => {
          if (projects.find(p => cwds.get(p.id) === cwd)?.config === 'throws')
            throw new Error('config is broken');
          return noItems.loadConfig(cwd);
        },
      }
    );
    return { ...(await get(app, '/api/factory/packs')), cwds };
  }

  test("the pack's own file wins, with no project named", async () => {
    // A global folder pack: the scratch home every test process starts with.
    const own = join(getHomeWorkflowsPath(), 'kit', '.shared', 'factory-overview.json');
    await mkdir(join(own, '..'), { recursive: true });
    await writeFile(own, JSON.stringify(overview('kit', "The pack's own")));
    try {
      const { status, body } = await read([
        {
          id: 'cb-1',
          name: 'web',
          files: { '.archon/packs/kit.factory-overview.json': overview('kit', 'Project') },
        },
      ]);
      expect(status).toBe(200);
      const [pack] = factoryPacksResponseSchema.parse(body).packs;
      expect([pack?.key, pack?.overview?.declaration.title, pack?.overview?.path]).toEqual([
        'kit',
        "The pack's own",
        own,
      ]);
      expect(pack?.readFrom).toBeNull();
    } finally {
      await removeTempTree(join(getHomeWorkflowsPath(), 'kit'));
    }
  });

  test('a project file is read from the first project by name, and the projects listed', async () => {
    const files = (title: string) => ({
      [viewFile]: declaration('acme/kit', 'Kit'),
      [overviewFile]: overview('acme/kit', title),
    });
    const { body, cwds } = await read([
      { id: 'cb-2', name: 'zeta', files: files('Zeta') },
      { id: 'cb-1', name: 'alpha', files: files('Alpha') },
    ]);
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
  const settingsOverview = {
    ...overview('kit', 'Kit'),
    settings: {
      land_policy: { points_to: 'policy', shadow: true, section: 'ahead', when_live: 'Would land' },
    },
    setting_sections: [
      {
        id: 'ahead',
        eyebrow: 'Gates',
        title: 'What may go ahead',
        kind: 'gate' as const,
        icon: 'gavel' as const,
      },
    ],
  };

  test("reads a home pack's declaration and each project's values", async () => {
    // A global folder pack: the scratch home every test process starts with.
    const pack = join(getHomeWorkflowsPath(), 'kit');
    await mkdir(join(pack, '.pack'), { recursive: true });
    await mkdir(join(pack, '.shared'), { recursive: true });
    await writeFile(
      join(pack, '.pack', 'pack.yaml'),
      'inputs:\n  land_policy:\n    default: ""\n    description: Shadow only.\n  command: {}\n'
    );
    await writeFile(
      join(pack, '.shared', 'factory-overview.json'),
      JSON.stringify(settingsOverview)
    );
    try {
      const { app } = await appFor(
        {
          '.archon/packs/kit.factory-view.json': declaration('kit', 'Kit factory'),
          '.archon/packs/kit.yaml': 'settings:\n  land_policy: docs/land.md\n  colour: red\n',
          'docs/land.md': '# Land',
        },
        cwd => ({ codebases: async () => [{ id: 'cb-1', name: 'web', cwd }] })
      );
      const { status, body } = await get(app, '/api/factory/pack-settings?pack=kit');
      expect(status).toBe(200);
      const settings = factoryPackSettingsResponseSchema.parse(body);
      expect(settings.declaration).toEqual({ path: join(pack, '.pack', 'pack.yaml'), error: null });
      expect(
        settings.settings.map(s => [s.name, s.shadow, s.pointsTo, s.section, s.whenLive])
      ).toEqual([
        ['land_policy', true, 'policy', 'ahead', 'Would land'],
        ['command', false, null, null, null],
      ]);
      expect(settings.sections).toEqual(settingsOverview.setting_sections);
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

const DISCOVERIES = {
  workflow: 'discoveries',
  shadow: true,
  filed: '/filed',
  held: '/held',
  dropped: '/dropped',
  entry: { title: '/title', kind: '/kind' },
};
/** One item, one drain: no other source of the store is read. */
const discoveriesSource = (() => {
  const item: WorkflowItem = { id: 'i-1', projectKey: 'acme/web', key: '1' };
  const drain = {
    id: 'd-1',
    workflow_name: 'acme/kit:discoveries',
    status: 'completed',
    metadata: {},
    started_at: new Date('2026-11-17T10:00:00Z'),
    completed_at: new Date('2026-11-17T10:05:00Z'),
  } as unknown as WorkflowRun;
  const drained: WorkflowEventRow = {
    id: 'd-1-completed',
    workflow_run_id: 'd-1',
    event_type: 'workflow_completed',
    step_index: null,
    step_name: null,
    data: {
      terminal_record: {
        run_id: 'd-1',
        status: 'completed',
        outcome: null,
        completed_outcome: null,
        error: null,
        first_failed_node: null,
        nodes: [],
        returns: {
          availability: 'available',
          node_id: 'drain',
          value: {
            filed: [{ title: 'A finding', kind: 'defect' }],
            held: [{ what: 'x', until: 'y' }],
            dropped: [],
          },
        },
        artifacts: { root: null, files: [], limitations: [] },
      },
    },
    created_at: '2026-11-17T10:05:00Z',
    event_order: 1,
  };
  return {
    listItemsInWindow: async () => [item],
    getItemRuns: async () => ({ item, runs: [drain], descendantIds: [] }),
    listEventsForRuns: async () => new Map([['d-1', [drained]]]),
  } as unknown as DiscoveriesSource;
})();

describe('GET /api/factory/discoveries', () => {
  test('what the drains decided, at the pointers the view declares', async () => {
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
    const { app } = await appFor(
      {
        [VIEW_FILE]: {
          ...declaration('acme/kit', 'Kit factory'),
          discoveries: DISCOVERIES,
          shadows,
        },
      },
      { discoveriesSource }
    );
    const { status, body } = await get(app, '/api/factory/discoveries?codebaseId=cb-1');
    expect(status).toBe(200);
    const read = factoryDiscoveriesResponseSchema.parse(body);
    expect(read).toMatchObject({ pack: 'acme/kit', shadow: true, held: 1, dropped: 0 });
    expect(read.findings.map(f => [f.title, f.kind, f.from.key, f.coveredBy])).toEqual([
      ['A finding', 'defect', '1', null],
    ]);
  });
});

/**
 * Five items, one run each: item 1 named `CHANGE` with a forge audit row naming PR 7; item 2 is
 * running; items 3 and 5 named an empty change URL; item 4 named `CHANGE9`, with no audit row.
 */
const ITEM_KEYS = ['1', '2', '3', '4', '5'] as const;
const items: WorkflowItem[] = ITEM_KEYS.map(key => ({
  id: `item-${key}`,
  projectKey: 'acme/web',
  key,
}));
const runOf = (key: string, fields: Partial<WorkflowRun> = {}): WorkflowRun => ({
  origin: null,
  id: `run-${key}`,
  workflow_name: 'acme/kit:deliver',
  conversation_id: null,
  parent_conversation_id: null,
  codebase_id: 'cb-1',
  status: 'completed',
  outcome: null,
  completed_outcome: 'ready',
  user_message: '',
  metadata: { inputs: { item: `#${key} Item ${key}\n\nThe body.` } },
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
  item_id: `item-${key}`,
  ...fields,
});
const runs: Record<string, WorkflowRun> = {
  '1': runOf('1'),
  '2': runOf('2', { status: 'running', completed_at: null, completed_outcome: null }),
  '3': runOf('3'),
  '4': runOf('4'),
  '5': runOf('5'),
};
const CHANGE = 'https://forge.example/acme/web/pull/7';
const CHANGE9 = 'https://forge.example/acme/web/pull/9';
const BRANCH_CHANGE = 'https://forge.example/acme/web/pull/8';
/** The terminal record a completed run records, its declared result naming `change`. */
const completed = (key: string, change: string): WorkflowEventRow => ({
  id: `run-${key}-completed`,
  workflow_run_id: `run-${key}`,
  event_type: 'workflow_completed',
  step_index: null,
  step_name: null,
  data: {
    terminal_record: {
      run_id: `run-${key}`,
      status: 'completed',
      outcome: null,
      completed_outcome: 'ready',
      error: null,
      first_failed_node: null,
      nodes: [],
      returns: { availability: 'available', node_id: 'result', value: { change } },
      artifacts: { root: null, files: [], limitations: [] },
    },
  },
  created_at: '2026-11-16T10:30:00Z',
  event_order: 9,
});
/** A forge audit row naming pull request 7 at `CHANGE`, the shape `pr.ready` records. */
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
};
const events: WorkflowEventRow[] = [
  completed('1', CHANGE),
  completed('3', ''),
  completed('4', CHANGE9),
  completed('5', ''),
  {
    id: 'e0-audit',
    workflow_run_id: 'run-1',
    event_type: 'integration_operation',
    step_index: null,
    step_name: null,
    data: PR7_AUDIT,
    created_at: '2026-11-16T10:29:00Z',
    event_order: 8,
  },
  {
    id: 'e1',
    workflow_run_id: 'run-2',
    event_type: 'node_started',
    step_index: null,
    step_name: 'build',
    data: {},
    created_at: '2026-11-16T11:00:00Z',
    event_order: 1,
  },
];

type ItemMerge = Awaited<ReturnType<ItemReadSource['store']['getItemMerge']>>;
const MERGED_AT = '2026-11-17T02:00:00.000Z';
/** A merge the engine recorded of `change`. */
const mergeOf = (change: string): ItemMerge => ({
  change,
  commit: null,
  at: MERGED_AT,
  recordedAt: MERGED_AT,
  via: 'cli',
  fromRun: null,
});

/** The store of the five items, with the merges recorded by item id. */
function itemsSource(merges: Record<string, ItemMerge> = {}): ItemReadSource {
  return {
    // The branch each run recorded, as the host reads it from the run's isolation record.
    branchOf: async run => `branch-${run.id}`,
    store: {
      getItemRuns: async (projectKey, key) => {
        const item = items.find(entry => entry.key === key && entry.projectKey === projectKey);
        const run = runs[key];
        return item && run ? { item, runs: [run], descendantIds: [] } : null;
      },
      listEventsForRuns: async ids =>
        new Map(ids.map(id => [id, events.filter(row => row.workflow_run_id === id)])),
      listAttentionQueueRows: async () => [],
      getWorkflowRun: async () => null,
      getWorkflowRunForAttention: async () => null,
      getCodebase: async () => null,
      getItem: async () => null,
      getItemMerge: async id => merges[id] ?? null,
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
}

const ITEMS_VIEW = {
  [VIEW_FILE]: {
    ...declaration('acme/kit', 'Kit factory'),
    itemTitle: { input: 'item' },
    change: { workflow: 'deliver', pointer: '/change' },
  },
};

/** The routes over the five items, the change host answering through `lookup`. */
const itemsApp = (
  lookup: FactoryRouteDeps['changeMergeState'],
  deps: Partial<FactoryRouteDeps> = {}
) => appFor(ITEMS_VIEW, { itemsSource: itemsSource(), changeMergeState: lookup, ...deps });

/** Each item's change on the progress route, for `keys`. */
const changes = async (app: OpenAPIHono, ...keys: string[]) => {
  const query = keys.map(key => `keys=${key}`).join('&');
  const { body } = await get(app, `/api/factory/progress?codebaseId=cb-1&${query}`);
  const { progress } = factoryProgressResponseSchema.parse(body);
  return keys.map(key => progress[key]?.change);
};
/** Item 1's change: the progress route's, then the item route's. */
const changeOfItem1 = async (app: OpenAPIHono) => {
  const [progress] = await changes(app, '1');
  const { body } = await get(app, '/api/factory/item?codebaseId=cb-1&key=1');
  return [progress, factoryItemDetailResponseSchema.parse(body).item.progress?.change];
};

/** A change host lookup held until `answer` is called; `calls` counts the lookups made. */
function heldLookup() {
  const held = {
    calls: 0,
    answer: (_value: ChangeMergeState): void => {},
    lookup: (): Promise<ChangeMergeState> => {
      held.calls++;
      return new Promise(resolve => {
        held.answer = resolve;
      });
    },
  };
  return held;
}
const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
};

describe('GET /api/factory/progress and /api/factory/item', () => {
  /** A forge that knows no number for a URL and finds PR 8 on any branches. */
  const forge = (lookups: unknown[] = [], branchesSeen: string[][] = []) =>
    (async (lookup, branches) => {
      lookups.push(lookup.kind === 'url' ? lookup.url : lookup);
      branchesSeen.push([...(await branches())]);
      return lookup.kind === 'url'
        ? { url: null, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: null }
        : { url: BRANCH_CHANGE, merged: false, mergedAt: null, number: 8 };
    }) satisfies FactoryRouteDeps['changeMergeState'];

  test('the progress of each key asked, repeated or one; a key with no item is left out', async () => {
    const { app } = await itemsApp(forge());
    const { status, body } = await get(app, '/api/factory/progress?codebaseId=cb-1&keys=2&keys=9');
    expect(status).toBe(200);
    const read = factoryProgressResponseSchema.parse(body);
    expect(read.pack).toBe('acme/kit');
    expect(read.progress).toEqual({
      '2': {
        title: 'Item 2',
        running: {
          runId: 'run-2',
          workflow: 'deliver',
          step: 'build',
          startedAt: '2026-11-16T10:00:00.000Z',
        },
        round: null,
        partOf: null,
        returned: 0,
        change: null,
        runs: [{ runId: 'run-2', workflow: 'deliver', failedStep: null }],
        shadows: [],
        parked: null,
        awaits: null,
      },
    });
    expect(read.members).toEqual({ '2': [] });
    const single = await get(app, '/api/factory/progress?codebaseId=cb-1&keys=1');
    expect(Object.keys(factoryProgressResponseSchema.parse(single.body).progress)).toEqual(['1']);
  });

  test("one item: its read and progress, with each run's story facts", async () => {
    const { app } = await itemsApp(forge());
    const { status, body } = await get(app, '/api/factory/item?codebaseId=cb-1&key=2');
    expect(status).toBe(200);
    const detail = factoryItemDetailResponseSchema.parse(body);
    expect(detail.pack).toBe('acme/kit');
    expect(detail.item.item.key).toBe('2');
    expect(detail.item.progress?.running?.step).toBe('build');
    expect(detail.runs).toEqual([
      {
        runId: 'run-2',
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

  test("an empty change URL: the PR the forge finds on the item's branches in the project's remote", async () => {
    const lookups: unknown[] = [];
    const branchesSeen: string[][] = [];
    const { app } = await itemsApp(forge(lookups, branchesSeen));
    expect(await changes(app, '3')).toEqual([
      { url: BRANCH_CHANGE, merged: false, mergedAt: null, number: 8 },
    ]);
    expect(lookups).toEqual([{ kind: 'branch', remote: REMOTE }]);
    expect(branchesSeen).toEqual([['branch-run-3']]);
  });
});

describe('the merge-state cache, across requests and both routes', () => {
  const merged = { url: CHANGE, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 7 };

  test('one lookup per change serves the next request and the item route', async () => {
    let lookups = 0;
    const branchesSeen: string[][] = [];
    const { app } = await itemsApp(async (_lookup, branches) => {
      lookups++;
      branchesSeen.push([...(await branches())]);
      return { url: null, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: null };
    });
    // The run's URL is shown, and the number its own forge audit row names.
    expect(await changes(app, '1', '2')).toEqual([merged, null]);
    expect(await changeOfItem1(app)).toEqual([merged, merged]);
    expect(lookups).toBe(1);
    // The lookup is handed the item's runs' recorded branches, for a change no audit row names.
    expect(branchesSeen).toEqual([['branch-run-1']]);
  });

  test('a slow first lookup answers pending within the wait, uncached, shared while in flight, then fills the cache', async () => {
    const held = heldLookup();
    const { app } = await itemsApp(held.lookup, { changeStateWaitMs: 10 });
    const pending = { url: CHANGE, merged: 'pending' as const, mergedAt: null, number: 7 };
    expect(await changes(app, '1')).toEqual([pending]);
    // Still running: the next read waits on the same lookup and answers pending again.
    expect(await changes(app, '1')).toEqual([pending]);
    expect(held.calls).toBe(1);
    held.answer(merged);
    await settle();
    expect(await changes(app, '1')).toEqual([merged]);
    expect(held.calls).toBe(1);
  });

  test('an answer a minute old is served while it refreshes; a merge is kept', async () => {
    let clock = 0;
    let lookups = 0;
    const { app } = await itemsApp(
      async () =>
        lookups++ === 0
          ? { url: null, merged: false, mergedAt: null, number: null }
          : { url: CHANGE, merged: true, mergedAt: '2026-11-17T01:00:00Z', number: 7 },
      { now: () => clock }
    );
    const mergedNow = async () => (await changes(app, '1'))[0]?.merged;
    expect(await mergedNow()).toBe(false);
    clock = 59_999;
    expect(await mergedNow()).toBe(false);
    expect(lookups).toBe(1);
    clock = 60_000;
    expect(await mergedNow()).toBe(false);
    await settle();
    expect(await mergedNow()).toBe(true);
    clock = 10_000_000;
    await mergedNow();
    expect(lookups).toBe(2);
  });

  test('a lookup that throws answers unknown, never fails the read, and is cached', async () => {
    let lookups = 0;
    const { app } = await itemsApp(async () => {
      lookups++;
      throw new Error('offline');
    });
    const unknown = { url: CHANGE, merged: 'unknown' as const, mergedAt: null, number: 7 };
    expect(await changes(app, '1')).toEqual([unknown]);
    expect(await changes(app, '1')).toEqual([unknown]);
    expect(lookups).toBe(1);
  });

  test('runs that named no URL get an answer each, asked in the project remote', async () => {
    const asked: ChangeLookup[] = [];
    const { app } = await itemsApp(async (lookup, branches) => {
      asked.push(lookup);
      // The pull request on each item's own branch.
      const number = (await branches()).includes('branch-run-3') ? 8 : 9;
      return { url: `${CHANGE.slice(0, -1)}${number}`, merged: true, mergedAt: null, number };
    });
    const numbers = async () => (await changes(app, '3', '5')).map(change => change?.number);
    expect(await numbers()).toEqual([8, 9]);
    expect(await numbers()).toEqual([8, 9]);
    expect(asked).toEqual([
      { kind: 'branch', remote: REMOTE },
      { kind: 'branch', remote: REMOTE },
    ]);
  });

  test('a slow branch lookup answers pending with no URL yet', async () => {
    const { app } = await itemsApp(() => new Promise(() => {}), { changeStateWaitMs: 10 });
    expect(await changes(app, '3')).toEqual([
      { url: null, merged: 'pending', mergedAt: null, number: null },
    ]);
  });

  /** The routes over the five items with `merges` recorded, the host answering through `lookup`. */
  const recordedApp = (
    merges: Record<string, ItemMerge>,
    lookup: FactoryRouteDeps['changeMergeState'],
    deps: Partial<FactoryRouteDeps> = {}
  ) => itemsApp(lookup, { itemsSource: itemsSource(merges), ...deps });
  const fromRecord = (url: string, number: number | null) => ({
    url,
    merged: true,
    mergedAt: MERGED_AT,
    number,
  });

  test('a recorded merge whose audit rows name its pull request answers on both routes, the host never asked', async () => {
    const held = heldLookup();
    const { app } = await recordedApp({ 'item-1': mergeOf(CHANGE) }, held.lookup);
    expect(await changeOfItem1(app)).toEqual([fromRecord(CHANGE, 7), fromRecord(CHANGE, 7)]);
    expect(held.calls).toBe(0);
  });

  test('a recorded merge answers at once; its number alone is asked for once, in the background', async () => {
    const held = heldLookup();
    // The wait would answer pending; a recorded merge never waits on it.
    const { app } = await recordedApp({ 'item-4': mergeOf(CHANGE9) }, held.lookup, {
      changeStateWaitMs: 60_000,
    });
    expect(await changes(app, '4')).toEqual([fromRecord(CHANGE9, null)]);
    expect(await changes(app, '4')).toEqual([fromRecord(CHANGE9, null)]);
    expect(held.calls).toBe(1);
    // The host answers with the pull request's number; whatever it says of the merge, the
    // record holds.
    held.answer({ url: CHANGE9, merged: false, mergedAt: null, number: 9 });
    await settle();
    expect(await changes(app, '4')).toEqual([fromRecord(CHANGE9, 9)]);
    expect(held.calls).toBe(1);
  });

  test('a recorded merge takes no number from another pull request the host found', async () => {
    let lookups = 0;
    const { app } = await recordedApp({ 'item-3': mergeOf(CHANGE) }, async () => {
      lookups++;
      return { url: `${CHANGE}0`, merged: true, mergedAt: null, number: 70 };
    });
    expect(await changes(app, '3')).toEqual([fromRecord(CHANGE, null)]);
    await settle();
    expect(await changes(app, '3')).toEqual([fromRecord(CHANGE, null)]);
    expect(lookups).toBe(1);
  });
});

const KIT_VIEW_FILE = '.archon/packs/kit.factory-view.json';
const DELIVER_FILE = '.archon/workflows/kit/deliver/deliver.yaml';
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
const discover = (cwd: string): Promise<WorkflowLoadResult> =>
  discoverWorkflows(cwd, { providers: providerRegistry, loadDefaults: false });
const WORKFLOW = '/api/factory/workflow?codebaseId=cb-1&workflow=deliver';

describe('GET /api/factory/workflow', () => {
  /** Real discovery, counted, its last call kept so a test can wait on a background refresh. */
  function countedDiscovery(fail: () => boolean = () => false) {
    const counted = {
      calls: 0,
      last: Promise.resolve() as Promise<unknown>,
      discoverWorkflows: (cwd: string): Promise<WorkflowLoadResult> => {
        counted.calls++;
        const found = fail() ? Promise.reject(new Error('disk busy')) : discover(cwd);
        counted.last = found.catch(() => undefined);
        return found;
      },
    };
    return counted;
  }
  const stepsOf = async (app: OpenAPIHono): Promise<string[]> => {
    const { status, body } = await get(app, WORKFLOW);
    expect(status).toBe(200);
    return factoryWorkflowSchema.parse(body).steps.map(step => step.key);
  };

  test("returns the steps of a workflow the project's view names", async () => {
    const { app } = await appFor(
      { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory'), [DELIVER_FILE]: DELIVER },
      { discoverWorkflows: discover }
    );
    const { status, body } = await get(app, WORKFLOW);
    expect(status).toBe(200);
    const workflow = factoryWorkflowSchema.parse(body);
    expect([workflow.name, workflow.runName]).toEqual(['deliver', 'deliver']);
    expect(workflow.groups.map(g => [g.id, g.kind, g.maxRounds])).toEqual([['rounds', 'loop', 2]]);
    expect(workflow.steps.map(s => [s.key, s.kind, s.yaml])).toEqual([
      ['rounds.fix', 'bash', 'id: fix\nbash: echo fixed'],
    ]);
  });

  test('concurrent reads share one discovery, its result serves the next read, and each project is its own', async () => {
    const counted = countedDiscovery();
    const files = { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory'), [DELIVER_FILE]: DELIVER };
    const other = await projectWith(files);
    const { app } = await appFor(files, project => ({
      discoverWorkflows: counted.discoverWorkflows,
      codebase: async id =>
        id === 'cb-1' || id === 'cb-2'
          ? { cwd: id === 'cb-1' ? project : other, projectKey: 'acme/web', remote: null }
          : null,
    }));
    const statuses = await Promise.all([get(app, WORKFLOW), get(app, WORKFLOW)]);
    expect(statuses.map(read => read.status)).toEqual([200, 200]);
    expect((await get(app, WORKFLOW)).status).toBe(200);
    expect(counted.calls).toBe(1);
    expect((await get(app, WORKFLOW.replace('cb-1', 'cb-2'))).status).toBe(200);
    expect(counted.calls).toBe(2);
  });

  test('an old result is served while a refresh runs; the next read gets the refresh', async () => {
    let clock = 0;
    const counted = countedDiscovery();
    const { app, project } = await appFor(
      { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory'), [DELIVER_FILE]: DELIVER },
      { discoverWorkflows: counted.discoverWorkflows, now: () => clock }
    );
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    await writeFile(join(project, DELIVER_FILE), DELIVER.replace('id: fix', 'id: mend'));
    clock = 29_999;
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    expect(counted.calls).toBe(1);
    clock = 30_000;
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    await counted.last;
    expect(counted.calls).toBe(2);
    expect(await stepsOf(app)).toEqual(['rounds.mend']);
  });

  test('a failed discovery is not kept; a failed refresh keeps the last result', async () => {
    let clock = 0;
    let fail = true;
    const counted = countedDiscovery(() => fail);
    const { app } = await appFor(
      { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory'), [DELIVER_FILE]: DELIVER },
      { discoverWorkflows: counted.discoverWorkflows, now: () => clock }
    );
    expect((await get(app, WORKFLOW)).status).toBe(500);
    fail = false;
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    expect(counted.calls).toBe(2);
    fail = true;
    clock = 60_000;
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    await counted.last;
    expect(counted.calls).toBe(3);
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
  });

  test('a workflow missing from a kept discovery is discovered again before the 404', async () => {
    const counted = countedDiscovery();
    const { app, project } = await appFor(
      { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory') },
      { discoverWorkflows: counted.discoverWorkflows }
    );
    expect((await get(app, WORKFLOW)).status).toBe(404);
    // The pack is installed after the 404, and the person reloads as it told them to.
    await mkdir(join(project, '.archon/workflows/kit/deliver'), { recursive: true });
    await writeFile(join(project, DELIVER_FILE), DELIVER);
    counted.calls = 0;
    expect(await stepsOf(app)).toEqual(['rounds.fix']);
    expect(counted.calls).toBe(1);
  });
});

/** The kit view listing `deliver` and `next` in Build, with `next` on disk and not `deliver`. */
const twoWorkflows = (retired?: string[]) => ({
  [KIT_VIEW_FILE]: {
    ...declaration('kit', 'Kit factory'),
    stages: [
      {
        id: 'build',
        label: 'Build',
        blurb: 'Builds.',
        group: 'build',
        workflows: ['deliver', 'next'],
      },
      { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
    ],
    ...(retired === undefined ? {} : { retired }),
  },
  '.archon/workflows/kit/next/next.yaml': DELIVER.replace('name: deliver', 'name: next'),
});
const KIT_DELIVER = { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory'), [DELIVER_FILE]: DELIVER };

describe('what each route answers a request it cannot serve', () => {
  const many = Array.from({ length: 101 }, (_, i) => `keys=${String(i)}`).join('&');
  test.each<[string, string, Record<string, unknown>, number, string | null]>([
    ['views: an unknown codebase', '/api/factory/views?codebaseId=missing', {}, 404, null],
    [
      'pack-settings: a key no pack with an overview has',
      '/api/factory/pack-settings?pack=nope',
      {},
      404,
      null,
    ],
    [
      'discoveries: a view that declares none',
      '/api/factory/discoveries?codebaseId=cb-1',
      { [VIEW_FILE]: declaration('acme/kit', 'Kit factory') },
      404,
      'This factory view declares no discoveries',
    ],
    ['discoveries: no applying view', '/api/factory/discoveries?codebaseId=cb-1', {}, 404, null],
    ['progress: no keys', '/api/factory/progress?codebaseId=cb-1', ITEMS_VIEW, 400, null],
    [
      'progress: more keys than a window page holds',
      `/api/factory/progress?codebaseId=cb-1&${many}`,
      ITEMS_VIEW,
      400,
      null,
    ],
    ['progress: no applying view', '/api/factory/progress?codebaseId=cb-1&keys=1', {}, 404, null],
    [
      'progress: an unknown codebase',
      '/api/factory/progress?codebaseId=missing&keys=1',
      ITEMS_VIEW,
      404,
      null,
    ],
    ['item: no key', '/api/factory/item?codebaseId=cb-1', ITEMS_VIEW, 400, null],
    ['item: no such item', '/api/factory/item?codebaseId=cb-1&key=9', ITEMS_VIEW, 404, null],
    [
      'item: an unknown codebase',
      '/api/factory/item?codebaseId=missing&key=1',
      ITEMS_VIEW,
      404,
      null,
    ],
    ['item: no applying view', '/api/factory/item?codebaseId=cb-1&key=1', {}, 404, null],
    [
      'workflow: one no applying view names',
      '/api/factory/workflow?codebaseId=cb-1&workflow=other',
      KIT_DELIVER,
      404,
      null,
    ],
    [
      'workflow: an unknown codebase',
      '/api/factory/workflow?codebaseId=missing&workflow=deliver',
      KIT_DELIVER,
      404,
      null,
    ],
    [
      // Read by a person on a stage: it names the pack and the workflow.
      'workflow: one the view names but the project lacks',
      WORKFLOW,
      { [KIT_VIEW_FILE]: declaration('kit', 'Kit factory') },
      404,
      'The pack kit has no workflow deliver in this project, so it cannot be drawn.',
    ],
    [
      'workflow: a retired one',
      WORKFLOW,
      twoWorkflows(['deliver']),
      404,
      'This pack has no workflow named deliver. It was retired; the items it worked still show their runs.',
    ],
    [
      'workflow: one missing from a pack whose other workflows are here',
      WORKFLOW,
      twoWorkflows(),
      404,
      'This pack has no workflow named deliver.',
    ],
  ])('%s', async (_name, path, files, status, error) => {
    const { app } = await appFor(files, {
      itemsSource: itemsSource(),
      discoveriesSource,
      discoverWorkflows: discover,
    });
    const read = await get(app, path);
    expect(read.status).toBe(status);
    if (error !== null) expect(read.body).toEqual({ error });
  });
});
