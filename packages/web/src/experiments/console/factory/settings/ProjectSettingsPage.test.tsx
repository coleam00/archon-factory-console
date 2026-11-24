/**
 * `/console/p/:projectId/factory/settings`: how this project has set up the pack its factory
 * view draws (the owner change of 2026-11-23 moved the page here from the sidebar Factory).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryPackSettings, FactoryViews } from '../../skills/factory';
import type { AttentionQueue } from '../../skills/runs';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { projectRoutes } from '../../routes/project-routes';
import { installDom } from '../../test-dom.test-helpers';
import { documentPageProblems, outlineBoxes } from '../document.test-helpers';

// A failed read lands after the first render, which static markup cannot reach.
const { mount: mountTree } = await installDom();
/** A read the cache does not answer never answers, unless a test says otherwise. */
const silent = Object.assign((): Promise<Response> => new Promise<Response>(() => undefined), {
  preconnect: globalThis.fetch.preconnect,
});
globalThis.fetch = silent;

const ID = 'cb-1';
let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
  invalidate('factory-views');
  invalidate(K.factoryPackSettings('acme.kit'));
});

const quiet: AttentionQueue = { items: [], runs: [], degraded: [] };
const views: FactoryViews = {
  views: [
    {
      pack: 'acme/kit',
      packKey: 'acme.kit',
      runNames: {},
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-view.json',
      declaration: {
        version: 1,
        pack: 'acme/kit',
        title: 'Kit factory',
        summary: 'Issues come in; changes go out.',
        stages: [{ id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] }],
        placement: {},
        endings: {},
        landed: { stage: 'landed' },
        map: { cards: [], arrows: [] },
      },
    },
  ],
  errors: [],
};

/** Project `id`'s page at `at`, its view and attention read. */
async function mount(at: string, id: string = ID): Promise<HTMLElement> {
  set(K.factoryViews(id), views);
  set(K.projectAttention(id), quiet);
  const page = await mountTree(
    <MemoryRouter initialEntries={[at]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
  unmount = page.unmount;
  return page.container;
}

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

/** The Settings page of project `id`, its pack's settings read as `settings`. */
async function settingsPage(
  settings: FactoryPackSettings = SETTINGS,
  id: string = ID
): Promise<HTMLElement> {
  set(K.factoryPackSettings('acme.kit'), settings);
  return mount(`/console/p/${id}/factory/settings`, id);
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
const hrefs = (within: ParentNode | null | undefined): string[] =>
  [...(within?.querySelectorAll('a') ?? [])].map(a => a.getAttribute('href') ?? '');

describe('/console/p/:projectId/factory/settings', () => {
  test("the default page: Factory tab's third page, its band, sections and every panel's words", async () => {
    const page = await settingsPage();
    const nav = page.querySelector('nav[aria-label="Factory"]');
    expect([...(nav?.querySelectorAll('a') ?? [])].map(a => a.textContent)).toEqual([
      'Overview',
      'Board',
      'Settings',
    ]);
    expect(hrefs(nav)).toEqual([
      `/console/p/${ID}/factory`,
      `/console/p/${ID}/factory/board`,
      `/console/p/${ID}/factory/settings`,
    ]);
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe('Settings');
    expect(bandTitle(page)).toBe('How web has set up its factory');
    expect(page.querySelector('[aria-label="Summary"]')?.textContent).toContain(
      "Read from the pack's declaration and this project's .archon/packs/acme.kit.yaml"
    );
    // web sets land, checks and validate; triage is empty, so it falls back to the pack.
    expect(chips(page)).toEqual([
      '4settings',
      '3set by this project',
      '1pack default',
      '2shadows today',
    ]);
    // No other project that runs the pack is named or linked.
    const body = page.querySelector('[data-doc-page]');
    expect(body?.textContent).not.toContain('api');
    expect(body?.textContent).not.toContain('colour');
    expect(hrefs(body)).toEqual([]);

    // Sections follow the map's order; an unmapped setting is in Other, last.
    expect(sections(page)).toEqual([
      'How a change is proven',
      'What work is held to',
      'Other settings',
      'Not declared by the pack',
    ]);
    const names = (section: Element | undefined) =>
      [...(section?.querySelectorAll('[data-setting] h3') ?? [])].map(h => h.textContent);
    const [proven, held, other, undeclared] = page.querySelectorAll('[data-doc-section]');
    expect([names(proven), names(held), names(other)]).toEqual([
      ['Checks file'],
      ['Triage policy', 'Land policy'],
      ['Validate command'],
    ]);
    expect(rows(undeclared)).toEqual(['size: large']);

    const triage = card(page, 'triage_policy');
    expect(triage?.querySelector('[data-id-tag]')?.textContent).toBe('triage_policy');
    expect(triage?.textContent).toContain('Path to the triage policy.');
    // An empty value is the "Pack default" pill, with no contradicting meta line under it.
    expect(triage?.querySelector('[data-pack-default]')).not.toBeNull();
    expect(triage?.textContent).not.toContain('Pack default:');
    expect(value(page, 'validate_command')).toBe('bun test');
    // A policy path not in the project says so, its whole path on hover.
    expect(value(page, 'land_policy')).toBe('docs/land.mdfile not found');
    expect(card(page, 'land_policy')?.querySelector('[title="/repo/docs/land.md"]')).not.toBeNull();
    // A checks file is rows of its checks.
    expect(rows(card(page, 'checks_file')?.querySelector('[aria-label="Checks"]'))).toEqual([
      'lint: bun run lint',
    ]);
    // The shadow badge marks the shadow settings only, with what would change.
    const badged = [...page.querySelectorAll('[data-setting]')]
      .filter(li => li.querySelector('[data-shadow-badge]') !== null)
      .map(li => li.getAttribute('data-setting'));
    expect(badged).toEqual(['checks_file', 'land_policy']);
    expect(card(page, 'land_policy')?.textContent).toContain(
      'Would land a change without asking you'
    );
  });

  test('each project reads its own values', async () => {
    expect(value(await settingsPage(), 'validate_command')).toBe('bun test');
    await unmount?.();
    unmount = undefined;
    const other = await settingsPage(SETTINGS, 'cb-2');
    expect(bandTitle(other)).toBe('How api has set up its factory');
    expect(value(other, 'validate_command')).toBe('Pack default');
    expect(other.querySelector('[data-doc-page]')?.textContent).not.toContain('web');
  });

  test('a declared default shows as meta', async () => {
    const [triage, ...rest] = SETTINGS.settings;
    const page = await settingsPage({
      ...SETTINGS,
      settings: [{ ...(triage ?? setting('triage_policy')), default: 'policy/triage.md' }, ...rest],
    });
    expect(card(page, 'triage_policy')?.textContent).toContain('Pack default: policy/triage.md');
  });

  /** Each state the page can be in, what it says, and owner change 5: filled panels, headed sections. */
  const states: [string, FactoryPackSettings, (page: HTMLElement) => void][] = [
    [
      'a project the read did not list',
      { ...SETTINGS, projects: [api] },
      page => {
        expect(page.querySelector('[role="alert"]')?.textContent).toBe(
          "This project's settings were not read; the page shows the pack's defaults."
        );
        expect(bandTitle(page)).toBe('How Kit is set up');
        expect(chips(page)).toEqual(['4settings', '2shadows today']);
        expect(value(page, 'validate_command')).toBe('Pack default');
        expect(page.querySelector('[data-doc-page]')?.textContent).not.toContain('api');
      },
    ],
    [
      'a map key the pack does not declare and an unreadable project file',
      {
        ...SETTINGS,
        mapErrors: [
          'The factory overview presents setting "gone", which the pack does not declare',
        ],
        projects: [{ ...web, error: '/repo/.archon/packs/acme.kit.yaml: not valid YAML' }],
      },
      page => {
        const alerts = [...page.querySelectorAll('[role="alert"]')].map(alert => alert.textContent);
        expect(alerts).toHaveLength(2);
        expect(alerts[0]).toContain("web's settings file could not be read");
        expect(alerts[1]).toContain('"gone"');
        // The file's error is said once; each panel only says "Not read".
        expect(page.textContent?.split('not valid YAML')).toHaveLength(2);
        for (const name of ['triage_policy', 'land_policy', 'checks_file', 'validate_command'])
          expect(value(page, name)).toBe('Not read');
        expect(chips(page)).toEqual(['4settings', '2shadows today']);
      },
    ],
    [
      'a pack that declares nothing',
      { ...SETTINGS, declaration: null, settings: [], projects: [] },
      page => expect(page.textContent).toContain('This pack declares no settings'),
    ],
    [
      'a pack declaration that does not parse',
      {
        ...SETTINGS,
        declaration: { path: '/p/.pack/pack.yaml', error: 'not valid YAML' },
        sections: [],
        settings: [],
        projects: [],
      },
      page => expect(page.textContent).toContain('not valid YAML'),
    ],
    ['the default', SETTINGS, () => undefined],
  ];
  test.each(states)('%s', async (_name, state, check) => {
    const page = await settingsPage(state);
    check(page);
    expect(documentPageProblems(page)).toEqual([]);
  });

  test('a read that fails, or one still running, draws filled panels, never an outline-only box', async () => {
    // A read that never answers holds the page on its skeleton.
    const waiting = await mount(`/console/p/${ID}/factory/settings`);
    expect(waiting.querySelector('[data-skeleton="true"]')).not.toBeNull();
    expect(outlineBoxes(waiting)).toEqual([]);
    await unmount?.();
    invalidate(K.factoryPackSettings('acme.kit'));
    globalThis.fetch = Object.assign(
      () => Promise.reject(new TypeError('connection refused')),
      silent
    );
    try {
      const page = await mount(`/console/p/${ID}/factory/settings`);
      const alert = [...page.querySelectorAll('[role="alert"]')].find(node =>
        node.textContent?.includes("The pack's settings could not be read")
      );
      expect(alert?.getAttribute('data-doc-panel')).toBe('panel');
      expect(outlineBoxes(page)).toEqual([]);
    } finally {
      globalThis.fetch = silent;
    }
  });
});
