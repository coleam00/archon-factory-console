import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Project } from '../../primitives/project';
import type { ItemPage, ItemRead } from '../../skills/items';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import type { PackView } from '../api';
import { shippedFile, shippedGraph } from '../curated.test-fixtures';
import { installDom } from '../test-dom.test-helpers';

const { mount: mountTree, settle } = await installDom();
// Loaded after the window exists: react-dom reads it when it loads.
const { FactoryHome, HowItWorksPage } = await import('./HowItWorksPage');

const PACK = 'Wirasm.archon-software-factory';
const PATH = '/packs/Wirasm/archon-software-factory/b62ec7b/.shared/factory-view.json';

const project = (id: string, itemPacks: string[]): Project => ({
  id,
  name: id,
  path: `/work/${id}`,
  defaultBranch: 'main',
  repositoryUrl: null,
  lastSyncedAt: null,
  kind: 'repo',
  itemPacks,
});

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  for (const prefix of ['projects', 'pack-view', 'pack-graph', 'board']) invalidate(prefix);
});

/** Mounts the sidebar's Factory routes at `at`, the pack staged by the second project. */
async function mount(at: string, view: PackView): Promise<HTMLElement> {
  set(K.projects, [project('cb-0', []), project('cb-1', [PACK])]);
  set(K.packView('cb-1', PACK), view);
  set(K.packGraph('cb-1', PACK), shippedGraph);
  set(K.board('cb-1'), [] satisfies ItemRead[]);
  set(K.boardDone('cb-1', PACK), {
    items: [],
    next: null,
    totals: { done: 0 },
  } as unknown as ItemPage);
  const mounted = await mountTree(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/console/factory" element={<FactoryHome />} />
        <Route path="/console/factory/:pack/how-it-works" element={<HowItWorksPage />} />
      </Routes>
    </MemoryRouter>
  );
  await settle();
  unmount = mounted.unmount;
  return mounted.container;
}

const CURATED: PackView = { path: PATH, view: shippedFile, problems: [] };
const NO_FILE: PackView = { path: null, view: null, problems: [] };
const page = `/console/factory/${PACK}/how-it-works`;

const cards = (within: ParentNode): string[] =>
  [...within.querySelectorAll('[data-card]')].map(card => card.getAttribute('data-card') ?? '');

describe('How it works', () => {
  test("/console/factory opens the first staged pack's How it works", async () => {
    const opened = await mount('/console/factory', CURATED);
    expect(opened.querySelector('h1')?.textContent).toBe(shippedFile.title);
  });

  test("with the file: the root view's cards and its caption, from the file", async () => {
    const opened = await mount(page, CURATED);
    const { howItWorks } = shippedFile;
    expect(cards(opened)).toEqual(
      howItWorks.views[howItWorks.root]?.cards.map(card => card.id) ?? []
    );
    expect(opened.textContent).toContain(howItWorks.caption);
    expect(opened.querySelector('div[data-flow]')).toBeNull();
  });

  test('?view=build opens the build drill-down', async () => {
    const opened = await mount(`${page}?view=build`, CURATED);
    expect(cards(opened)).toEqual(
      shippedFile.howItWorks.views.build?.cards.map(card => card.id) ?? []
    );
  });

  test("without the file: the pack's document and the derived map", async () => {
    const opened = await mount(page, NO_FILE);
    expect(opened.querySelector('[data-document]')?.textContent).toContain('How the factory works');
    expect(opened.querySelector('div[data-flow]')).not.toBeNull();
    expect(cards(opened)).toEqual([]);
  });

  test('a pack no project stages says so and draws nothing else', async () => {
    const opened = await mount('/console/factory/acme.other/how-it-works', CURATED);
    expect(opened.querySelector('[data-unstaged]')?.textContent).toContain('acme.other');
    expect(cards(opened)).toEqual([]);
    expect(opened.querySelector('div[data-flow]')).toBeNull();
  });
});
