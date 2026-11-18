import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import type { FactoryPacksRead } from '../../skills/factory';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { FactoryRailLink } from '../FactoryRailLink';
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
          <Route path="/rail" element={<FactoryRailLink />} />
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
  test('shows once a pack is listed, and not with none', async () => {
    const shown = await mount('/rail', listing([pack('acme.kit', 'Kit')]));
    expect(hrefs(shown)).toEqual(['/console/factory']);
    expect(shown.textContent).toContain('Factory');
    await unmount?.();

    const hidden = await mount('/rail', listing([]));
    expect(hrefs(hidden)).toEqual([]);
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
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual(['Kit', 'Web']);
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
    expect(page.textContent).toContain('Overview file is broken');
  });
});

describe('/console/factory/:pack/how-it-works', () => {
  const two = listing([pack('acme.kit', 'Kit'), pack('acme.web', 'Web', { readFrom: null })]);

  test('draws the overview with ?view= open, and names the project it was read from', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works?view=make', two);
    const crumbs = [...page.querySelectorAll('nav[aria-label="Breadcrumb"] li')].map(li =>
      li.textContent?.replace('›', '').trim()
    );
    expect(crumbs).toEqual(['Kit', 'Make']);
    expect(page.querySelector('h1')?.textContent).toBe('Kit');
    expect(page.querySelector('header')?.textContent).toContain('Read from web');
    expect(hrefs(page.querySelector('header'))).toContain('/console/p/cb-1/factory');
  });

  test("the pack's own file names no project", async () => {
    const page = await mount('/console/factory/acme.web/how-it-works', two);
    expect(page.querySelector('header')?.textContent).not.toContain('Read from');
    expect(page.querySelector('header')?.textContent).toContain("the pack's own overview file");
  });

  test('has one tab, How it works, until the settings tab is built', async () => {
    const page = await mount('/console/factory/acme.kit/how-it-works', two);
    const tabs = page.querySelector('nav[aria-label="Pack"]');
    expect(hrefs(tabs)).toEqual(['/console/factory/acme.kit/how-it-works']);
    expect(tabs?.textContent).toBe('How it works');
  });

  test('the bare pack address opens How it works', async () => {
    const page = await mount('/console/factory/acme.kit', two);
    expect(at(page)).toBe('/console/factory/acme.kit/how-it-works');
  });

  test('an unknown pack says so and links every pack', async () => {
    const page = await mount('/console/factory/nope/how-it-works', two);
    expect(page.textContent).toContain('No factory pack here');
    expect(hrefs(page)).toContain('/console/factory');
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
