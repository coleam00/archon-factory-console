import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { OpenAPIHono } from '@hono/zod-openapi';
import { trackTempRoots } from '@archon/paths/test-utils';
import { registerFactoryRoutes, type FactoryRouteDeps } from './api.factory';
import { factoryPacksResponseSchema, factoryViewsSchema } from './schemas/factory.schemas';

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

/** Deps for an install with no codebases; each test replaces what it reads. */
const noCodebases: FactoryRouteDeps = {
  codebase: async () => null,
  codebases: async () => [],
  loadConfig: async () => ({
    assistant: undefined,
    commands: {},
    assistants: { claude: {}, codex: {} },
  }),
  ranWorkflows: async () => new Set(),
};

/**
 * The routes over a project holding `files`, registered as codebase `cb-1`. Each call is its
 * own app. `deps` replaces what a test reads.
 */
async function appFor(
  files: Record<string, unknown> = {},
  deps: Partial<FactoryRouteDeps> | ((project: string) => Partial<FactoryRouteDeps>) = {}
): Promise<{ app: OpenAPIHono; project: string }> {
  const project = await projectWith(files);
  const app = new OpenAPIHono();
  registerFactoryRoutes(app, {
    ...noCodebases,
    codebase: async id => (id === 'cb-1' ? { cwd: project } : null),
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
  test('a project file is read from the first project by name, and the projects listed', async () => {
    const files = (title: string) => ({
      '.archon/packs/acme.kit.factory-view.json': declaration('acme/kit', 'Kit'),
      '.archon/packs/acme.kit.factory-overview.json': overview('acme/kit', title),
    });
    const alpha = await projectWith(files('Alpha'));
    const zeta = await projectWith(files('Zeta'));
    const { app } = await appFor(
      {},
      {
        codebases: async () => [
          { id: 'cb-2', name: 'zeta', cwd: zeta },
          { id: 'cb-1', name: 'alpha', cwd: alpha },
        ],
      }
    );
    const { status, body } = await get(app, '/api/factory/packs');
    expect(status).toBe(200);
    const [pack, ...others] = factoryPacksResponseSchema.parse(body).packs;
    expect(others).toEqual([]);
    expect([pack?.pack, pack?.key, pack?.overview?.declaration.title]).toEqual([
      'acme/kit',
      'acme.kit',
      'Alpha',
    ]);
    expect(pack?.readFrom).toEqual({ codebaseId: 'cb-1', name: 'alpha' });
    expect(pack?.projects).toEqual([
      { codebaseId: 'cb-1', name: 'alpha' },
      { codebaseId: 'cb-2', name: 'zeta' },
    ]);
  });
});
