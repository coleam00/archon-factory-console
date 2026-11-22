import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import type { FactoryPackSettings, FactoryPacksRead } from '../../skills/factory';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { ConsoleNav } from '../../components/ConsoleNav';
import { documentPageProblems, outlineBoxes } from '../document.test-helpers';
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
    // Each card is titled by the pack's name as a person reads it (its id on hover), its
    // overview's caption under it.
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual(['Kit', 'Web']);
    expect(cards[0]?.querySelector('h2 a')?.getAttribute('title')).toBe('acme/kit');
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
    expect(cards[1]?.querySelector('h2')?.textContent).toBe('Web');
    expect(hrefs(cards[1])).toContain('/console/factory/acme.web/how-it-works');
  });
});

describe('/console/factory/:pack/how-it-works', () => {
  const two = listing([
    pack('acme.kit', 'How the kit works'),
    pack('acme.web', 'Web', { readFrom: null }),
  ]);

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

  test('the file it was read from is a detail behind Source, not a line of the header', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works', two);
    const header = page.querySelector('header');
    // Closed: the header names neither the project nor the file.
    expect(header?.textContent).not.toContain('factory-overview.json');
    expect(header?.querySelector('a[href="/console/p/cb-1/factory"]')).toBeNull();
    const toggle = header?.querySelector('button[aria-expanded]');
    expect(toggle?.textContent).toBe('Source');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      (toggle as HTMLElement).click();
    });
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    const source = document.getElementById(toggle?.getAttribute('aria-controls') ?? '');
    expect(source?.querySelector('a[href="/console/p/cb-1/factory"]')?.textContent).toBe('web');
    expect(source?.textContent).toContain('acme.kit.factory-overview.json');
  });

  test("the pack's own file names no project", async () => {
    const page = await mount('/console/factory/acme.web/how-it-works', two);
    // The source sits behind the Source toggle: open it, then read what it says.
    const toggle = page.querySelector<HTMLElement>('header button[aria-expanded]');
    await act(async () => {
      toggle?.click();
    });
    const source = document.getElementById(toggle?.getAttribute('aria-controls') ?? '');
    expect(source?.textContent).toContain("the pack's own overview file");
    expect(hrefs(source).filter(href => href.startsWith('/console/p/'))).toEqual([]);
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
  const packs = listing([pack('acme.kit', 'How the kit works')]);
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
    section: null,
    whenLive: null,
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
    undeclared: [{ name: 'size', value: 'large' }],
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
    sections: [
      {
        id: 'proven',
        eyebrow: 'Checks',
        title: 'How a change is proven',
        kind: 'check',
        icon: 'flask',
      },
      {
        id: 'held',
        eyebrow: 'Policies',
        title: 'What work is held to',
        kind: 'stage',
        icon: 'scale',
      },
      {
        id: 'filed',
        eyebrow: 'Discoveries',
        title: 'What gets filed',
        kind: 'outcome',
        icon: 'flag',
      },
    ],
    settings: [
      setting('triage_policy', {
        description: 'Path to the triage policy.',
        pointsTo: 'policy',
        section: 'held',
      }),
      setting('land_policy', {
        shadow: true,
        pointsTo: 'policy',
        section: 'held',
        whenLive: 'Would land a change without asking you',
      }),
      setting('checks_file', { shadow: true, pointsTo: 'checks', section: 'proven' }),
      setting('validate_command', { default: null }),
    ],
    mapErrors: [],
    projects: [web, api],
  };

  async function settingsPage(
    settings: FactoryPackSettings = SETTINGS,
    query = '?project=cb-1'
  ): Promise<HTMLElement> {
    set(K.factoryPackSettings('acme.kit'), settings);
    return mount(`/console/factory/acme.kit/settings${query}`, packs);
  }
  const card = (page: HTMLElement, name: string): Element | null =>
    page.querySelector(`[data-setting="${name}"]`);
  const value = (page: HTMLElement, name: string): string | null | undefined =>
    card(page, name)?.querySelector('[data-setting-value]')?.textContent;
  const rows = (within: Element | null | undefined): string[] =>
    [...(within?.querySelectorAll('dl > div') ?? [])].map(row =>
      [row.querySelector('dt')?.textContent, row.querySelector('dd')?.textContent].join(': ')
    );
  const chips = (page: HTMLElement): string[] =>
    [...page.querySelectorAll('[data-stat-chip]')].map(chip => chip.textContent ?? '');
  const sections = (page: HTMLElement): string[] =>
    [...page.querySelectorAll('[data-doc-section]')].map(
      section => section.querySelector('h2')?.textContent ?? ''
    );
  const bandTitle = (page: HTMLElement): string | null | undefined =>
    page.querySelector('[aria-label="Summary"] h2')?.textContent;

  test('is the active tab, and opens with a band counting how the project set it up', async () => {
    const page = await settingsPage();
    const active = page.querySelector('nav[aria-label="Pack"] [aria-current="page"]');
    expect(active?.getAttribute('href')).toBe('/console/factory/acme.kit/settings');
    // Settings names the pack as How it works does, never the overview's title.
    expect(page.querySelector('h1')?.textContent).toBe('Kit');
    expect(page.querySelector('h1')?.getAttribute('title')).toBe('acme/kit');
    expect(page.querySelector('header button[aria-expanded]')?.textContent).toBe('Source');
    expect(page.querySelector('[data-doc-page] > [aria-label="Summary"]')).not.toBeNull();
    expect(bandTitle(page)).toBe('How web has set up its factory');
    // web sets land, checks and validate; triage is empty, so it falls back to the pack.
    expect(chips(page)).toEqual([
      '4settings',
      '3set by this project',
      '1pack default',
      '2shadows today',
    ]);
    expect(page.querySelector('[data-stat-chip="shadow"]')?.textContent).toBe('2shadows today');
  });

  test("sections follow the map's order; an unmapped setting is in Other, last", async () => {
    const page = await settingsPage();
    expect(sections(page)).toEqual([
      'How a change is proven',
      'What work is held to',
      'Other settings',
      'Not declared by the pack',
    ]);
    const names = (section: Element | undefined) =>
      [...(section?.querySelectorAll('[data-setting] h3') ?? [])].map(h => h.textContent);
    const [proven, held, other] = page.querySelectorAll('[data-doc-section]');
    expect(names(proven)).toEqual(['Checks file']);
    expect(names(held)).toEqual(['Triage policy', 'Land policy']);
    expect(names(other)).toEqual(['Validate command']);
    const shown = [...page.querySelectorAll('[data-setting]')].map(el =>
      el.getAttribute('data-setting')
    );
    expect(shown.sort()).toEqual([
      'checks_file',
      'land_policy',
      'triage_policy',
      'validate_command',
    ]);
  });

  test('a panel has its plain name, its id tag, its description and the pack default', async () => {
    const page = await settingsPage();
    const triage = card(page, 'triage_policy');
    expect(triage?.querySelector('h3')?.textContent).toBe('Triage policy');
    expect(triage?.querySelector('[data-id-tag]')?.textContent).toBe('triage_policy');
    expect(triage?.textContent).toContain('Path to the triage policy.');
    expect(triage?.textContent).toContain('Pack default: none');
  });

  test('an empty or unset value is the "Pack default" pill; a set value is shown as it is', async () => {
    const page = await settingsPage();
    expect(card(page, 'triage_policy')?.querySelector('[data-pack-default]')).not.toBeNull();
    expect(value(page, 'validate_command')).toBe('bun test');
    await unmount?.();
    unmount = undefined;
    const other = await settingsPage(SETTINGS, '?project=cb-2');
    expect(value(other, 'validate_command')).toBe('Pack default');
  });

  test('a policy path not in the project says "file not found", its whole path on hover', async () => {
    const page = await settingsPage();
    expect(value(page, 'land_policy')).toBe('docs/land.mdfile not found');
    expect(card(page, 'land_policy')?.querySelector('[title="/repo/docs/land.md"]')).not.toBeNull();
  });

  test('a checks file is shown as rows of its checks, name and command, in an inset box', async () => {
    const page = await settingsPage();
    const checks = card(page, 'checks_file')?.querySelector('[aria-label="Checks"]');
    expect(checks?.getAttribute('data-doc-panel')).toBe('inset');
    expect(rows(checks)).toEqual(['lint: bun run lint']);
  });

  test('the shadow badge marks the shadow settings only, with what would change', async () => {
    const page = await settingsPage();
    const badged = [...page.querySelectorAll('[data-setting]')]
      .filter(li => li.querySelector('[data-shadow-badge]') !== null)
      .map(li => li.getAttribute('data-setting'));
    expect(badged).toEqual(['checks_file', 'land_policy']);
    expect(card(page, 'land_policy')?.textContent).toContain(
      'Would land a change without asking you'
    );
    // A shadow's bar is rule 10's --node-opaque; any other panel takes its section's colour.
    expect(card(page, 'land_policy')?.getAttribute('style')).toContain('var(--node-opaque)');
    expect(card(page, 'triage_policy')?.getAttribute('style')).toContain('var(--node-wait)');
  });

  test('with no ?project= the first project by name is shown, and the band links to each', async () => {
    const page = await settingsPage(SETTINGS, '');
    expect(bandTitle(page)).toBe('How api has set up its factory');
    expect(chips(page)).toEqual([
      '4settings',
      '0set by this project',
      '4pack defaults',
      '2shadows today',
    ]);
    const projects = page.querySelector('[aria-label="Summary"] nav[aria-label="Project"]');
    expect(hrefs(projects)).toEqual([
      '/console/factory/acme.kit/settings?project=cb-2',
      '/console/factory/acme.kit/settings?project=cb-1',
    ]);
    expect(projects?.querySelector('[aria-current="page"]')?.textContent).toBe('api');
  });

  test('an unknown ?project= says so and shows the pack alone', async () => {
    const page = await settingsPage(SETTINGS, '?project=cb-9');
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('"cb-9"');
    expect(bandTitle(page)).toBe('How Kit is set up');
    expect(chips(page)).toEqual(['4settings', '2shadows today']);
    expect(value(page, 'validate_command')).toBe('Pack default');
  });

  test('a key the project in focus sets that the pack does not declare is listed as such', async () => {
    const page = await settingsPage();
    const undeclared = [...page.querySelectorAll('[data-doc-section]')].find(
      section => section.querySelector('h2')?.textContent === 'Not declared by the pack'
    );
    expect(rows(undeclared)).toEqual(['size: large']);
  });

  test('a map key the pack does not declare, and an unreadable project file, say so', async () => {
    const page = await settingsPage({
      ...SETTINGS,
      mapErrors: ['The factory overview presents setting "gone", which the pack does not declare'],
      projects: [{ ...web, error: 'not valid YAML', values: {} }, api],
    });
    expect(page.querySelector('[role="alert"]')?.textContent).toContain('"gone"');
    expect(value(page, 'triage_policy')).toBe(
      "web's settings file could not be read: not valid YAML"
    );
    expect(chips(page)).toEqual(['4settings', '2shadows today']);
  });

  test('a pack that declares nothing says so', async () => {
    const page = await settingsPage({ ...SETTINGS, declaration: null, settings: [], projects: [] });
    expect(page.textContent).toContain('This pack declares no settings');
  });

  test('every state of the page is held to owner change 5: filled panels and headed sections', async () => {
    const states: [FactoryPackSettings, string][] = [
      [SETTINGS, '?project=cb-1'],
      [{ ...SETTINGS, mapErrors: ['The factory overview presents setting "gone"'] }, ''],
      [{ ...SETTINGS, projects: [{ ...web, error: 'not valid YAML', values: {} }] }, ''],
      [SETTINGS, '?project=cb-9'],
      [{ ...SETTINGS, declaration: null, settings: [], projects: [] }, ''],
      [
        {
          ...SETTINGS,
          declaration: { path: '/p/.pack/pack.yaml', error: 'not valid YAML' },
          sections: [],
          settings: [],
          projects: [],
        },
        '',
      ],
    ];
    for (const [state, query] of states) {
      const page = await settingsPage(state, query);
      expect(page.querySelector('[data-doc-page]')).not.toBeNull();
      expect(documentPageProblems(page)).toEqual([]);
      await unmount?.();
      unmount = undefined;
    }
  });

  test('while the settings are read, the skeleton draws no outline-only box', async () => {
    // A read that never answers holds the page on its skeleton.
    const fetch = globalThis.fetch;
    globalThis.fetch = Object.assign(() => new Promise<Response>(() => undefined), fetch);
    try {
      const page = await mount('/console/factory/acme.kit/settings', packs);
      expect(page.querySelector('[data-skeleton="true"]')).not.toBeNull();
      expect(outlineBoxes(page)).toEqual([]);
    } finally {
      globalThis.fetch = fetch;
    }
  });
});
