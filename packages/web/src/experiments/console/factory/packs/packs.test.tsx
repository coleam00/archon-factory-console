import { afterEach, describe, expect, test } from 'bun:test';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import type { FactoryPacksRead } from '../api';
import { invalidate, set } from '../../store/cache';
import { FK } from '../keys';
import { installDom } from '../test-dom.test-helpers';
import { FactoryRailLink } from '../FactoryRailLink';
import { OVERVIEW } from '../lib/overview.test-fixtures';
import type { FactoryPackListed } from '../lib/views';
import { factoryPackRoutes } from './routes';

// The redirects and the drill-down need a live tree; static markup follows neither.
const { mount: mountTree } = await installDom();

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  invalidate(FK.factoryPacks);
});

const pack = (key: string, title: string, more: Partial<FactoryPackListed> = {}) => ({
  pack: key.replace('.', '/'),
  key,
  overview: {
    pack: key.replace('.', '/'),
    source: 'project-file' as const,
    path: `/repo/.archon/packs/${key}.factory-overview.json`,
    declaration: { ...OVERVIEW, title },
  },
  readFrom: { codebaseId: 'cb-1', name: 'web' },
  projects: [{ codebaseId: 'cb-1', name: 'web' }],
  errors: [],
  ...more,
});
const listing = (packs: FactoryPackListed[]): FactoryPacksRead => ({
  packs,
  errors: [],
  unreadProjects: [],
});

function LocationProbe(): ReactElement {
  const { pathname, search } = useLocation();
  return <output data-at={pathname + search} data-by={useNavigationType()} />;
}

async function mount(at: string, packs: FactoryPacksRead): Promise<HTMLElement> {
  set(FK.factoryPacks, packs);
  const page = await mountTree(
    <MemoryRouter initialEntries={[at]}>
      <LocationProbe />
      <Routes>
        {factoryPackRoutes('/console/')}
        <Route path="/rail" element={<FactoryRailLink />} />
      </Routes>
    </MemoryRouter>
  );
  unmount = page.unmount;
  return page.container;
}

const at = (page: HTMLElement): string | null =>
  page.querySelector('output')?.getAttribute('data-at') ?? null;
const hrefs = (within: ParentNode | null | undefined): string[] =>
  [...(within?.querySelectorAll('a') ?? [])].map(a => a.getAttribute('href') ?? '');

describe('the sidebar Factory entry', () => {
  test('opens How it works of the pack', async () => {
    const page = await mount('/rail', listing([pack('acme.kit', 'Kit')]));
    await act(async () => {
      page.querySelector('a')?.click();
    });
    expect(at(page)).toBe('/console/factory/acme.kit/how-it-works');
  });

  test('is absent with no pack', async () => {
    const page = await mount('/rail', listing([]));
    expect(hrefs(page)).toEqual([]);
  });
});

const two = listing([
  pack('acme.kit', 'How the kit works'),
  pack('acme.web', 'Web', { readFrom: null }),
]);
// The server lists packs by name; the console opens the first it lists, whatever its key.
const twoReversed = listing([...two.packs].reverse());
// What the old index stopped to show: a file it could not read, a project it could not open.
const withProblems: FactoryPacksRead = {
  ...listing([pack('acme.kit', 'Kit')]),
  errors: [{ pack: 'acme/other', source: 'installed', path: '/plugins/x.json', error: 'bad' }],
  unreadProjects: [{ codebaseId: 'cb-2', name: 'api', error: 'gone' }],
};

describe('/console/factory opens How it works directly', () => {
  test.each([
    ['one pack', '/console/factory', listing([pack('acme.kit', 'Kit')]), 'acme.kit'],
    ['several: the first listed', '/console/factory', two, 'acme.kit'],
    ['several, listed the other way', '/console/factory', twoReversed, 'acme.web'],
    ['a listing that also reports problems', '/console/factory', withProblems, 'acme.kit'],
    ['a pack without its page', '/console/factory/acme.kit', two, 'acme.kit'],
  ] as const)('%s', async (_, from, packs, key) => {
    const page = await mount(from, packs);
    expect(at(page)).toBe(`/console/factory/${key}/how-it-works`);
    expect(page.querySelector('output')?.getAttribute('data-by')).toBe('REPLACE');
  });

  test('with no pack, stays and says so: no index of packs, no link back', async () => {
    const page = await mount('/console/factory', listing([]));
    expect(at(page)).toBe('/console/factory');
    expect(page.querySelector('h1')).not.toBeNull();
    expect(page.querySelector('article')).toBeNull();
    expect(hrefs(page)).toEqual([]);
  });
});

describe('/console/factory/:pack/how-it-works', () => {
  test.each([
    ['acme.kit', ["a project's copy of the overview file", 'acme.kit.factory-overview.json']],
    ['acme.web', ["the pack's own overview file"]],
  ])('%s: the file it was read from is behind Source, naming no project', async (key, says) => {
    const page = await mount(`/console/factory/${key}/how-it-works`, two);
    const header = page.querySelector('header');
    expect(header?.textContent).not.toContain('factory-overview.json');
    expect(header?.textContent).not.toContain('web');
    const toggle = header?.querySelector<HTMLElement>('button[aria-expanded]');
    expect(toggle?.textContent).toBe('Source');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      toggle?.click();
    });
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const source = document.getElementById(toggle?.getAttribute('aria-controls') ?? '');
    for (const words of says) expect(source?.textContent).toContain(words);
    expect(source?.textContent?.replaceAll(key, '')).not.toContain('web');
    expect(hrefs(source)).toEqual([]);
  });

  test("draws the overview with ?view= open, under the pack's readable name", async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works?view=make', two);
    const crumbs = [...page.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map(li =>
      li.textContent?.replace('›', '').trim()
    );
    // The overview's title heads the map (its breadcrumb's root); the page names the pack,
    // its raw id only on hover.
    expect(crumbs).toEqual(['How the kit works', 'Make']);
    const h1 = page.querySelector('h1');
    expect(h1?.textContent).toBe('Kit');
    expect(h1?.getAttribute('title')).toBe('acme/kit');
  });

  test('is the only page: no tabs, no Settings, no project named or linked', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works', two);
    expect(page.querySelector('nav[aria-label="Pack"]')).toBeNull();
    expect(hrefs(page).filter(href => href.endsWith('/settings'))).toEqual([]);
    expect(hrefs(page).filter(href => href.startsWith('/console/p/'))).toEqual([]);
    expect(page.textContent).not.toContain('Settings');
  });

  test.each(['acme.kit', 'nope'])('%s links back to no list of packs', async key => {
    const page = await mount(`/console/factory/${key}/how-it-works`, two);
    expect(at(page)).toBe(`/console/factory/${key}/how-it-works`);
    expect(hrefs(page).filter(href => href === '/console/factory')).toEqual([]);
  });
});
