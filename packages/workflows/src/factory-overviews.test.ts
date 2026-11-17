import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { trackTempRoots } from '@archon/paths/test-utils';
import * as bundleInventory from './defaults/bundle-inventory';
import { discoverFactoryOverviews, factoryOverviewForPack } from './factory-overviews';
import { discoverFactoryViews } from './factory-views';
import type { FactoryOverview } from './schemas/factory-overview';
import { DEFAULT_WORKFLOW_SOURCE_CONFIG } from './workflow-source';
import type { LiveWorkflowSourceRoots } from './workflow-source/roots';

const track = trackTempRoots();
const indexSpy = spyOn(bundleInventory, 'readBundleIndex').mockResolvedValue([]);
afterAll(() => {
  indexSpy.mockRestore();
});

let roots: LiveWorkflowSourceRoots;
let project: string;

beforeEach(async () => {
  const root = track(await mkdtemp(join(tmpdir(), 'archon-factory-overviews-')));
  project = join(root, 'project');
  roots = {
    kind: 'live',
    config: DEFAULT_WORKFLOW_SOURCE_CONFIG,
    project,
    globalWorkflows: join(root, 'home', 'workflows'),
    globalCommands: join(root, 'home', 'commands'),
    globalScripts: join(root, 'home', 'scripts'),
    bundledWorkflows: join(root, 'bundled'),
    installed: { kind: 'receipts', pluginsDir: join(root, 'home', 'plugins') },
  };
});

const overview = (pack: string, title: string): FactoryOverview => ({
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

async function write(path: string, content: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
}

const projectFile = (key: string): string =>
  join(project, '.archon', 'packs', `${key}.factory-overview.json`);
const packFile = (pack: string): string =>
  join(project, '.archon', 'workflows', pack, '.shared', 'factory-overview.json');

describe('discoverFactoryOverviews', () => {
  test("finds a project file and a pack's own file", async () => {
    await write(projectFile('acme.kit'), overview('acme/kit', 'From the project'));
    await write(packFile('folder'), overview('folder', 'From the pack'));

    const listing = await discoverFactoryOverviews(roots);
    expect(listing.errors).toEqual([]);
    expect(listing.overviews.map(o => [o.pack, o.source, o.declaration.title, o.path])).toEqual([
      ['acme/kit', 'project-file', 'From the project', projectFile('acme.kit')],
      ['folder', 'project', 'From the pack', packFile('folder')],
    ]);
  });

  test("a project file replaces the pack's own file, and so does a broken one", async () => {
    await write(projectFile('wins'), overview('wins', 'From the project'));
    await write(packFile('wins'), overview('wins', 'From the pack'));
    await write(projectFile('broken'), '{ "version": ');
    await write(packFile('broken'), overview('broken', 'From the pack'));

    const listing = await discoverFactoryOverviews(roots);
    expect(listing.overviews.map(o => [o.pack, o.declaration.title])).toEqual([
      ['wins', 'From the project'],
    ]);
    expect(listing.errors.map(({ pack, source, path }) => [pack, source, path])).toEqual([
      ['broken', 'project-file', projectFile('broken')],
    ]);
  });

  test('an invalid file is listed with its path and the field at fault', async () => {
    const invalid = overview('folder', 'Invalid');
    invalid.root = 'nope';
    await write(packFile('folder'), invalid);

    const listing = await discoverFactoryOverviews(roots);
    expect(listing.overviews).toEqual([]);
    expect(listing.errors[0]?.error).toContain(packFile('folder'));
    // The field at fault, and the value it named.
    expect(listing.errors[0]?.error).toContain('root:');
    expect(listing.errors[0]?.error).toContain('"nope"');
  });

  test('a file naming another pack than where it was found is an error', async () => {
    await write(projectFile('acme.kit'), overview('acme/other', 'Mislabelled'));
    await write(packFile('folder'), overview('elsewhere', 'Mislabelled'));

    const listing = await discoverFactoryOverviews(roots);
    expect(listing.overviews).toEqual([]);
    // Each is listed under where it was found, naming the pack it declared.
    expect(listing.errors.map(({ pack }) => pack)).toEqual(['acme.kit', 'folder']);
    expect(listing.errors[0]?.error).toContain('acme/other');
    expect(listing.errors[1]?.error).toContain('elsewhere');
  });

  test('a factory view file is not read as an overview, nor the reverse', async () => {
    await write(projectFile('acme.kit'), overview('acme/kit', 'Overview'));
    // A view file's name, holding an overview: the view reader refuses it, the overview reader never sees it.
    await write(
      join(project, '.archon', 'packs', 'other.factory-view.json'),
      overview('other', 'x')
    );

    const overviews = await discoverFactoryOverviews(roots);
    expect(overviews.overviews.map(o => o.pack)).toEqual(['acme/kit']);
    expect(overviews.errors).toEqual([]);
    const views = await discoverFactoryViews(roots);
    expect(views.views).toEqual([]);
    expect(views.errors.map(e => e.path)).toEqual([
      join(project, '.archon', 'packs', 'other.factory-view.json'),
    ]);
  });
});

describe('factoryOverviewForPack', () => {
  test("gives a pack's overview and only its errors, whichever key they are listed under", () => {
    const listed = (pack: string) => ({
      pack,
      source: 'project-file' as const,
      path: `/${pack}`,
      declaration: overview(pack, pack),
    });
    const listing = {
      overviews: [listed('acme/kit'), listed('folder')],
      errors: [
        { pack: 'acme.kit', source: 'project-file' as const, path: '/a', error: 'bad' },
        { pack: 'other', source: 'project' as const, path: '/b', error: 'bad' },
      ],
    };
    const kit = factoryOverviewForPack(listing, 'acme/kit');
    expect(kit.overview?.pack).toBe('acme/kit');
    expect(kit.errors.map(e => e.path)).toEqual(['/a']);
    expect(factoryOverviewForPack(listing, 'none')).toEqual({ overview: null, errors: [] });
  });
});
