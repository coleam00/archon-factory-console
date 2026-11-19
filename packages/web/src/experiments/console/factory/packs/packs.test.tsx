import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import type { FactoryPackSettings, FactoryPacksRead } from '../../skills/factory';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { ConsoleNav } from '../../components/ConsoleNav';
import { OVERVIEW } from '../lib/overview.test-fixtures';
import type { FactoryPackListed } from '../lib/views';
import { factoryPackRoutes } from './routes';

// The index's redirect and the drill-down need a live tree; static markup follows neither.
const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');

afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  invalidate(K.factoryPacks);
  invalidate(K.factoryPackSettings('acme.kit'));
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
  set(K.factoryPacks, packs);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <LocationProbe />
        <Routes>
          {factoryPackRoutes('/console/')}
          <Route path="/rail" element={<ConsoleNav />} />
        </Routes>
      </MemoryRouter>
    )
  );
  unmount = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

const at = (page: HTMLElement): string | null =>
  page.querySelector('output')?.getAttribute('data-at') ?? null;
const hrefs = (within: ParentNode | null | undefined): string[] =>
  [...(within?.querySelectorAll('a') ?? [])].map(a => a.getAttribute('href') ?? '');

describe('the sidebar Factory entry', () => {
  // The rail's own navigation, as ProjectRail renders it.
  test('sits just above Settings once a pack is listed, and is absent with none', async () => {
    const shown = await mount('/rail', listing([pack('acme.kit', 'Kit')]));
    expect(hrefs(shown)).toEqual([
      '/console/metrics',
      '/console/builder',
      '/console/factory',
      '/console/settings',
    ]);
    await unmount?.();

    const hidden = await mount('/rail', listing([]));
    expect(hrefs(hidden)).toEqual(['/console/metrics', '/console/builder', '/console/settings']);
  });
});

describe('/console/factory', () => {
  test('with one pack, opens its page in place of the index', async () => {
    const page = await mount('/console/factory', listing([pack('acme.kit', 'Kit')]));
    expect(at(page)).toBe('/console/factory/acme.kit/how-it-works');
    expect(page.querySelector('output')?.getAttribute('data-by')).toBe('REPLACE');
  });

  test('with two, a card each: title, summary, project count and links', async () => {
    const page = await mount(
      '/console/factory',
      listing([
        pack('acme.kit', 'Kit'),
        pack('acme.web', 'Web', {
          projects: [
            { codebaseId: 'cb-1', name: 'web' },
            { codebaseId: 'cb-2', name: 'api' },
          ],
        }),
      ])
    );
    const cards = [...page.querySelectorAll('article')];
    // Each card is titled by the pack's name, its overview's caption under it.
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual([
      'acme/kit',
      'acme/web',
    ]);
    expect(cards[0]?.textContent).toContain(OVERVIEW.caption);
    expect(cards[0]?.textContent).toContain('Runs on 1 project');
    expect(cards[1]?.textContent).toContain('Runs on 2 projects');
    expect(hrefs(cards[1])).toEqual([
      '/console/factory/acme.web/how-it-works',
      '/console/p/cb-1/factory',
      '/console/p/cb-2/factory',
    ]);
  });

  test('with one pack and a project it could not read, stays to say so', async () => {
    const page = await mount('/console/factory', {
      ...listing([pack('acme.kit', 'Kit')]),
      unreadProjects: [{ codebaseId: 'cb-9', name: 'gone', error: 'ENOENT' }],
    });
    expect(at(page)).toBe('/console/factory');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('gone: ENOENT');
    expect(page.querySelectorAll('article')).toHaveLength(1);
  });

  test('a pack whose files are all broken still gets a card, saying so', async () => {
    const page = await mount(
      '/console/factory',
      listing([pack('acme.kit', 'Kit'), pack('acme.web', 'Web', { overview: null })])
    );
    const cards = [...page.querySelectorAll('article')];
    expect(cards).toHaveLength(2);
    // With no overview, the card is still titled by the pack's name and opens its page.
    expect(cards[1]?.querySelector('h2')?.textContent).toBe('acme/web');
    expect(hrefs(cards[1])).toContain('/console/factory/acme.web/how-it-works');
  });
});

describe('/console/factory/:pack/how-it-works', () => {
  const two = listing([pack('acme.kit', 'Kit'), pack('acme.web', 'Web', { readFrom: null })]);

  test('draws the overview with ?view= open, and names the project it was read from', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works?view=make', two);
    const crumbs = [...page.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map(li =>
      li.textContent?.replace('›', '').trim()
    );
    // The overview's title heads the map (its breadcrumb's root); the page names the pack.
    expect(crumbs).toEqual(['Kit', 'Make']);
    expect(page.querySelector('h1')?.textContent).toBe('acme/kit');
    const project = page.querySelector('header a[href="/console/p/cb-1/factory"]');
    expect(project?.textContent).toBe('web');
  });

  test("the pack's own file names no project", async () => {
    const page = await mount('/console/factory/acme.web/how-it-works', two);
    const header = hrefs(page.querySelector('header'));
    expect(header.filter(href => href.startsWith('/console/p/'))).toEqual([]);
  });

  test('has two tabs, How it works and Settings', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works', two);
    const tabs = page.querySelector('nav[aria-label="Pack"]');
    expect(hrefs(tabs)).toEqual([
      '/console/factory/acme.kit/how-it-works',
      '/console/factory/acme.kit/settings',
    ]);
    expect(tabs?.querySelector('[aria-current="page"]')?.textContent).toBe('How it works');
  });

  test('the bare pack address opens How it works', async () => {
    const page = await mount('/console/factory/acme.kit', two);
    expect(at(page)).toBe('/console/factory/acme.kit/how-it-works');
  });

  test('an unknown pack says so and links every pack', async () => {
    const page = await mount('/console/factory/nope/how-it-works', two);
    expect(page.querySelector('[data-card]')).toBeNull();
    expect(page.textContent).toContain('No installed pack keyed "nope"');
    const back = page.querySelector('a[data-back-link]');
    expect(back?.getAttribute('href')).toBe('/console/factory');
    expect(back?.className).not.toContain('underline');
  });

  test("a broken pack file's error shows on its page", async () => {
    const page = await mount(
      '/console/factory/acme.kit/how-it-works',
      listing([
        pack('acme.kit', 'Kit', {
          overview: null,
          readFrom: null,
          errors: [{ pack: 'acme/kit', source: 'installed', path: '/p/o.json', error: 'bad root' }],
        }),
      ])
    );
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('bad root');
  });
});

describe('/console/factory/:pack/settings', () => {
  const packs = listing([pack('acme.kit', 'Kit')]);
  type ProjectSettings = FactoryPackSettings['projects'][number];
  const file = (
    display: string,
    status: 'found' | 'missing',
    checks: { name: string; run: string }[] | null = null
  ) => ({ display, full: `/repo/${display}`, status, error: null, checks });
  const setting = (
    name: string,
    more: Partial<FactoryPackSettings['settings'][number]> = {}
  ): FactoryPackSettings['settings'][number] => ({
    name,
    description: null,
    default: '',
    type: 'string',
    shadow: false,
    pointsTo: null,
    ...more,
  });
  const web: ProjectSettings = {
    codebaseId: 'cb-1',
    name: 'web',
    error: null,
    values: {
      triage_policy: { state: 'empty' },
      land_policy: {
        state: 'set',
        value: 'docs/land.md',
        problem: null,
        file: file('docs/land.md', 'missing'),
      },
      checks_file: {
        state: 'set',
        value: 'checks.yaml',
        problem: null,
        file: file('checks.yaml', 'found', [{ name: 'lint', run: 'bun run lint' }]),
      },
      validate_command: { state: 'set', value: 'bun test', problem: null, file: null },
    },
    undeclared: [],
  };
  const api: ProjectSettings = {
    codebaseId: 'cb-2',
    name: 'api',
    error: null,
    values: {
      triage_policy: { state: 'unset' },
      land_policy: { state: 'unset' },
      checks_file: { state: 'unset' },
      validate_command: { state: 'unset' },
    },
    undeclared: [{ name: 'colour', value: 'red' }],
  };
  const SETTINGS: FactoryPackSettings = {
    pack: 'acme.kit',
    declaration: { path: '/home/plugins/acme/kit/.pack/pack.yaml', error: null },
    settingsFile: '.archon/packs/acme.kit.yaml',
    settings: [
      setting('triage_policy', { description: 'Path to the triage policy.', pointsTo: 'policy' }),
      setting('land_policy', { shadow: true, pointsTo: 'policy' }),
      setting('checks_file', { shadow: true, pointsTo: 'checks' }),
      setting('validate_command', { default: null }),
    ],
    mapErrors: [],
    projects: [web, api],
  };

  async function settingsPage(settings: FactoryPackSettings = SETTINGS): Promise<HTMLElement> {
    set(K.factoryPackSettings('acme.kit'), settings);
    return mount('/console/factory/acme.kit/settings', packs);
  }
  const card = (page: HTMLElement, name: string): Element | null =>
    page.querySelector(`[data-setting="${name}"]`);
  const rows = (within: Element | null): string[] =>
    [...(within?.querySelectorAll('dl > div') ?? [])].map(row =>
      [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent].join(': ')
    );

  test('is the active tab, one card per declared setting in order, by its plain name', async () => {
    const page = await settingsPage();
    const active = page.querySelector('nav[aria-label="Pack"] [aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('/console/factory/acme.kit/settings');
    // Settings names the pack, never How it works' title.
    expect(page.querySelector('h1')?.textContent).toBe('acme/kit');
    expect([...page.querySelectorAll('[data-setting] h2')].map(h => h.textContent)).toEqual([
      'Triage policy',
      'Land policy',
      'Checks file',
      'Validate command',
    ]);
    expect(card(page, 'triage_policy')?.textContent).toContain('Path to the triage policy.');
  });

  test('an empty or unset value says "pack default", per project', async () => {
    const page = await settingsPage();
    expect(rows(card(page, 'triage_policy'))).toEqual(['web: pack default', 'api: pack default']);
    expect(rows(card(page, 'validate_command'))).toEqual(['web: bun test', 'api: pack default']);
  });

  test('a policy path not in the project says "file not found", its whole path on hover', async () => {
    const page = await settingsPage();
    expect(rows(card(page, 'land_policy'))[0]).toBe('web: docs/land.mdfile not found');
    expect(card(page, 'land_policy')?.querySelector('[title="/repo/docs/land.md"]')).not.toBeNull();
  });

  test('a checks file is listed as its checks: name and command', async () => {
    const page = await settingsPage();
    const checks = card(page, 'checks_file')?.querySelector('ul[aria-label="Checks"]');
    expect([...(checks?.querySelectorAll('li') ?? [])].map(li => li.textContent)).toEqual([
      'lintbun run lint',
    ]);
  });

  test('the shadow badge marks the shadow settings only', async () => {
    const page = await settingsPage();
    const badged = [...page.querySelectorAll('[data-setting]')]
      .filter(li => [...li.querySelectorAll('span')].some(span => span.textContent === 'shadow'))
      .map(li => li.getAttribute('data-setting'));
    expect(badged).toEqual(['land_policy', 'checks_file']);
  });

  test('a key a project sets that the pack does not declare is listed as such', async () => {
    const page = await settingsPage();
    const undeclared = page.querySelector('section[aria-label="Not declared by the pack"]');
    expect(undeclared?.querySelector('h2')?.textContent).toBe('Not declared by the pack');
    expect(rows(undeclared)).toEqual(['api: colourred']);
  });

  test('a map key the pack does not declare, and an unreadable project file, say so', async () => {
    const page = await settingsPage({
      ...SETTINGS,
      mapErrors: ['The factory overview presents setting "gone", which the pack does not declare'],
      projects: [{ ...web, error: 'not valid YAML', values: {} }, api],
    });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('"gone"');
    expect(rows(card(page, 'triage_policy'))[0]).toBe(
      'web: Its settings file could not be read: not valid YAML'
    );
  });

  test('a pack that declares nothing says so', async () => {
    const page = await settingsPage({ ...SETTINGS, declaration: null, settings: [], projects: [] });
    expect(page.textContent).toContain('This pack declares no settings');
  });
});
