import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { ProjectAttentionProvider } from '../components/ProjectAttention';
import { Board } from './BoardPage';
import type { FactoryItem } from '../skills/factory';
import {
  endLastRun,
  idleInPlan,
  keepRuns,
  needsShaping,
  PAGE,
  parkedByTriage,
  readyWithMerge,
  realItem,
  VIEW,
  FIXTURE_NOW,
} from './lib/board.test-fixtures';
import { DISCOVERIES } from './lib/discoveries.test-fixtures';
import { boardModel } from './lib/board';
import { timeToLand } from './lib/board-table';
import { factoryNumbers } from './lib/numbers';
import { cancelRereads } from './merge-reread';
import { cancelMergeWatches } from './merge-watch';
import { formatDateTime } from '../lib/format';
import { boardColumns } from './lib/board-columns';

// Filtering, sorting and the move highlight follow a re-render, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
/** The project's attention stream, which says nothing here. */
class QuietEventSource {
  onmessage: unknown = null;
  onerror: unknown = null;
  readyState = 0;
  close(): void {
    this.readyState = 2;
  }
}
const globals = {
  window: dom,
  document: dom.document,
  EventSource: QuietEventSource,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');
const originalFetch = globalThis.fetch;
// Every read comes from the cache the test sets; a fetch would mean a key was missed.
globalThis.fetch = Object.assign(
  async (): Promise<Response> => {
    throw new Error('the board test fetched');
  },
  { preconnect: originalFetch.preconnect }
);

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-1';
/** `board` under a project queue where nothing waits on a person: the ask face has its own tests (BoardAsks.test.tsx). */
function quiet(board: ReactElement): ReactElement {
  set(K.projectAttention(ID), { items: [], runs: [], degraded: [] });
  return <ProjectAttentionProvider projectId={ID}>{board}</ProjectAttentionProvider>;
}
// The Merged column lists the last 7 local days; the fixtures merged on 2026-11-17.
const NOW = new Date(2026, 10, 18, 12, 0);
const DAY = 24 * 60 * 60 * 1000;
afterEach(() => {
  cancelRereads();
  cancelMergeWatches();
  invalidate('factory-items');
});

async function mount(
  items: FactoryItem[],
  path = `/console/p/${ID}/factory/board`,
  members: Record<string, string[]> = {}
) {
  set(K.factoryItems(ID), { items, members });
  // The view declares discoveries, so the board mounts the "Found by the factory" panel.
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory/board"
            element={quiet(<Board projectId={ID} view={VIEW} now={NOW} />)}
          />
        </Routes>
      </MemoryRouter>
    )
  );
  return {
    container,
    unmount: async (): Promise<void> => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** Each column's label and count, as its header shows them ("checking" while it waits). */
const headers = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('header[data-column]')].map(
    header =>
      `${header.querySelector('h3')?.textContent ?? ''}${header.querySelector('[data-count]')?.textContent ?? ''}`
  );

/** A column's section by its label. */
const columnNamed = (container: HTMLElement, label: string): Element | null =>
  container.querySelector(`section[aria-label="${label}"]`);

const cardKeys = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('article')].map(card => card.getAttribute('data-card') ?? '');

/** The item key a card shows, on the line above its title. */
const keyOf = (card: Element | null | undefined): string | null | undefined =>
  card?.querySelector('div > span')?.textContent;

const card = (container: HTMLElement, key: string): Element | null =>
  container.querySelector(`article[data-card="${key}"]`);

/** Type `query` into the board's filter box, as a keystroke does. */
async function filterTo(container: HTMLElement, query: string): Promise<void> {
  const input = container.querySelector('input[type="search"]') as HTMLInputElement;
  await act(async () => {
    // React listens for the native input event; set the value the way a keystroke does.
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, query);
    input.dispatchEvent(new dom.Event('input', { bubbles: true }) as unknown as Event);
  });
}

/** Items the board sets aside: one ended, one long idle, one parked. */
const setAsideItems = (): FactoryItem[] => [
  endLastRun(keepRuns(realItem('6'), 1), 'completed', 'fold'),
  idleInPlan('i', new Date(NOW.getTime() - 4 * DAY).toISOString()),
  parkedByTriage('p'),
];

/** The one toggle under the board, which opens both strips. */
const stripsToggle = (container: HTMLElement): HTMLButtonElement | null =>
  container.querySelector('[data-board-strips] > button');

const viewButton = (container: HTMLElement, label: 'Pipeline' | 'Table'): HTMLButtonElement =>
  [...container.querySelectorAll('button')].find(
    button => button.textContent === label
  ) as HTMLButtonElement;

/** Each row's key, in the order the Table draws them. */
const rowKeys = (container: HTMLElement, selector = 'tbody tr'): string[] =>
  [...container.querySelectorAll(selector)].map(row => row.getAttribute('data-card') ?? '');

/** Real item 7 (merged) keyed `key`, merged at `at`. */
function mergedOn(key: string, at: Date): FactoryItem {
  const item = realItem('7');
  item.item = { ...item.item, key };
  item.progress = {
    ...item.progress!,
    change: { ...item.progress!.change!, mergedAt: at.toISOString() },
  };
  return item;
}

/** Item 7 of the fixture page, keyed as a pack revision keys it. */
const keyed = (key: string): FactoryItem => {
  const item = realItem('7');
  return { ...item, item: { ...item.item, key } };
};

test('before the items are read: a skeleton column per declared column', async () => {
  const quietFetch = globalThis.fetch;
  // A read that never answers: the board stays in its loading state.
  globalThis.fetch = Object.assign(async (): Promise<Response> => new Promise(() => {}), {
    preconnect: originalFetch.preconnect,
  });
  set(K.factoryDiscoveries(ID), DISCOVERIES);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[`/console/p/${ID}/factory/board`]}>
          {quiet(<Board projectId={ID} view={VIEW} now={NOW} />)}
        </MemoryRouter>
      )
    );
    expect(headers(container)).toEqual(boardColumns(VIEW).map(column => `${column.label}loading`));
    const columns = [...container.querySelectorAll('section[aria-label]')].filter(section =>
      section.querySelector('header[data-column]')
    );
    for (const column of columns)
      expect(column.querySelectorAll('[data-skeleton="block"]')).toHaveLength(2);
    expect(container.querySelector('[aria-label="Board view"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Loading…');
    expect(container.textContent).not.toContain('…');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    globalThis.fetch = quietFetch;
  }
});

test('the captured page in the Pipeline', async () => {
  // happy-dom lays nothing out: a column body is 250 px tall, 100 px per child, so the bottom
  // fade has something to follow.
  const proto = dom.HTMLElement.prototype as unknown as HTMLElement;
  const saved = ['scrollHeight', 'clientHeight'].map(
    key => [key, Object.getOwnPropertyDescriptor(proto, key)] as const
  );
  const sized = (value: (body: HTMLElement) => number) => ({
    configurable: true,
    get(this: HTMLElement): number {
      return this.dataset.columnBody === undefined ? 0 : value(this);
    },
  });
  Object.defineProperty(
    proto,
    'scrollHeight',
    sized(body => body.children.length * 100)
  );
  Object.defineProperty(
    proto,
    'clientHeight',
    sized(() => 250)
  );
  // 9 is linked to 48 and has no run yet: 48 has its page, nothing on the board to light.
  const { container, unmount } = await mount(PAGE.items, undefined, { '48': ['9'] });
  try {
    // One column per declared column with its count, every real item in its column.
    expect(headers(container)).toEqual([
      'Intake0',
      'Plan & build4',
      'Checks & review1',
      'Ready to merge0',
      'Merged3',
    ]);
    const checks = columnNamed(container, 'Checks & review');
    expect(
      checks?.querySelector('a[aria-label="Checks · Product check · round 1"]')
    ).not.toBeNull();
    // The card opens its item page and its run.
    expect(checks?.querySelector(`a[href="/console/p/${ID}/factory/items/8"]`)).not.toBeNull();
    expect(checks?.querySelector('a[href^="/console/p/cb-1/r/"]')).not.toBeNull();

    // A header names its column, its stages and its cards' states.
    const header = columnNamed(container, 'Plan & build')?.querySelector('header');
    expect(header?.querySelector('p')?.textContent).toBe('Plan, build');
    expect([...(header?.querySelectorAll('li') ?? [])].map(chip => chip.textContent)).toEqual([
      'running 2',
      'waiting 2',
    ]);
    expect(columnNamed(container, 'Intake')?.textContent).toContain('Nothing in Intake now');

    // A waiting card names the stage it waits in and links no run.
    const waiting = [
      ...(columnNamed(container, 'Plan & build')?.querySelectorAll('article') ?? []),
    ].find(article => keyOf(article) === '#6');
    expect(waiting?.textContent).toContain('Build');
    expect(waiting?.querySelector('a[href*="/r/"]')).toBeNull();

    // A plain key reads #7 and opens the item under its key.
    expect(keyOf(card(container, '7'))).toBe('#7');
    expect(card(container, '7')?.querySelector('a[href*="/items/"]')?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/items/7`
    );

    // No work order has a member on the board, and nothing is set aside.
    expect(container.textContent).not.toContain('work order');
    expect(container.querySelector('section[aria-labelledby="set-aside-heading"]')).toBeNull();

    // The view declares discoveries: one Found line after every column, closed.
    const line = container.querySelector(
      '[data-board-strips] section[aria-labelledby="found-by-the-factory-heading"]'
    );
    expect(line?.querySelector('h2')?.textContent).toBe('Found by the factory');
    expect(stripsToggle(container)?.textContent).toBe('show them');
    expect(stripsToggle(container)?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('ul[aria-label="What the drains decided"]')).toBeNull();
    const lastColumn = [...container.querySelectorAll('header[data-column]')].at(-1);
    expect(
      lastColumn!.compareDocumentPosition(line!) & dom.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    // The filter narrows the cards by key or title; a column it empties says no card matches.
    const fade = () => columnNamed(container, 'Merged')?.querySelector('[data-fade]');
    expect(fade()).not.toBeNull();
    await filterTo(container, 'needs you');
    expect(cardKeys(container)).toEqual(['7']);
    expect(headers(container)).toContain('Merged1');
    const planBuild = columnNamed(container, 'Plan & build')?.textContent ?? '';
    expect(planBuild).toContain('No card here matches the filter');
    expect(planBuild).not.toContain('Nothing in');
    // The bottom fade follows the cards the filter leaves, not only scrolling.
    expect(fade()).toBeNull();
    await filterTo(container, '');
    expect(fade()).not.toBeNull();
  } finally {
    await unmount();
    for (const [key, descriptor] of saved)
      if (descriptor) Object.defineProperty(proto, key, descriptor);
      else Reflect.deleteProperty(proto, key);
  }
});

test('set-aside items and the strips under the board', async () => {
  const { container, unmount } = await mount([...setAsideItems(), realItem('7')]);
  try {
    // Items with nothing left to happen fold into one Set aside line, never a folded row.
    expect(cardKeys(container)).toEqual(['7']);
    expect(container.querySelector('details')).toBeNull();
    const strips = container.querySelector('[data-board-strips]');
    expect(strips?.querySelector('section[aria-labelledby="set-aside-heading"]')?.textContent).toBe(
      '3 set aside'
    );
    // One control for both strips: neither line card has a button of its own.
    expect(strips?.querySelectorAll('button')).toHaveLength(1);
    expect(strips?.querySelectorAll('section button')).toHaveLength(0);

    const toggle = stripsToggle(container);
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(toggle?.textContent).toBe('hide them');
    expect(container.querySelector('#found-by-the-factory-list')).not.toBeNull();
    const list = container.querySelector('#set-aside-list');
    // Each row by its key (the order is the model's), as its leaves: key, title, why, when.
    const row = (key: string): (string | null)[] | undefined => {
      const li = [...(list?.querySelectorAll('li') ?? [])].find(
        item => item.querySelector('a')?.textContent === key
      );
      if (li === undefined) return undefined;
      return [...li.querySelectorAll('a, span')]
        .filter(element => element.children.length === 0)
        .map(element => element.textContent);
    };
    expect(list?.querySelectorAll('li')).toHaveLength(3);
    const link = [...(list?.querySelectorAll('li a') ?? [])].find(a => a.textContent === '#6');
    expect(link?.getAttribute('href')).toBe(`/console/p/${ID}/factory/items/6`);
    expect(row('p')).toEqual([
      'p',
      realItem('6').progress?.title ?? '',
      'Parked by triage',
      formatDateTime(parkedByTriage('p').runs[0]?.completedAt ?? ''),
    ]);
    expect(row('i')?.[2]).toBe('No change was proposed');
    expect(row('#6')?.[2]).toBe('Folded into another item');
    expect(list?.textContent).not.toMatch(/archived|deleted/i);

    // Switching to the Table leaves the strips open, drawn after the table and outside it.
    await act(async () => viewButton(container, 'Table').click());
    const table = container.querySelector('table');
    const opened = container.querySelector('[data-board-strips-open]');
    expect(rowKeys(container)).toEqual(['7']);
    expect(container.querySelector('#set-aside-list')).not.toBeNull();
    expect(
      table!.compareDocumentPosition(opened!) & dom.Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(table!.parentElement?.contains(opened)).toBe(false);
    await act(async () => viewButton(container, 'Pipeline').click());
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelector('#set-aside-list')).not.toBeNull();
    expect(stripsToggle(container)?.textContent).toBe('hide them');

    // The same toggle closes both.
    await act(async () => stripsToggle(container)?.click());
    expect(stripsToggle(container)?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('#found-by-the-factory-list')).toBeNull();
    expect(container.querySelector('#set-aside-list')).toBeNull();
  } finally {
    await unmount();
  }
});

test('a view with no discoveries: the strip line only when something is set aside', async () => {
  const noStrip = { ...VIEW, discoveries: undefined };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = async (items: FactoryItem[]): Promise<void> => {
    set(K.factoryItems(ID), { items, members: {} });
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[`/console/p/${ID}/factory/board`]}>
          {quiet(<Board projectId={ID} view={noStrip} now={NOW} />)}
        </MemoryRouter>
      )
    );
  };
  try {
    await render([...setAsideItems(), realItem('7')]);
    expect(container.querySelector('#found-by-the-factory-heading')).toBeNull();
    expect(container.querySelector('#set-aside-heading')?.textContent).toBe('3 set aside');
    expect(stripsToggle(container)).not.toBeNull();
    await render(PAGE.items);
    expect(container.querySelector('[data-board-strips]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

describe('work orders', () => {
  /**
   * Items made members by their order runs' results: 5 and 4 (running) are part of 48, and 2
   * (merged) is the only member of 8, an order with runs. 9 is linked to 48 and has no run.
   */
  const withOrders = (): FactoryItem[] => {
    const named: Record<string, string> = { '5': '48', '4': '48', '2': '8' };
    return PAGE.items.map(item =>
      item.item.key in named
        ? { ...item, progress: { ...item.progress!, partOf: named[item.item.key]! } }
        : item
    );
  };
  const members = { '48': ['9'] };
  /** The work orders section's header toggle. */
  const summary = (container: HTMLElement): HTMLButtonElement | undefined =>
    [...container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')].find(button =>
      button.textContent?.includes('work order')
    );
  const dimmed = (container: HTMLElement) =>
    container.querySelectorAll('article[data-dimmed="true"]');

  test('work orders on the board', async () => {
    const { container, unmount } = await mount(withOrders(), undefined, members);
    try {
      // 48 has running members, so it is open; 8's only member merged, so it is not.
      const button = summary(container);
      expect(button?.textContent).toBe('2 work orders · 1 open');
      // Its own section, not a part of the filter's toolbar line, and before the columns.
      const section = button?.closest('section') ?? null;
      const toolbar = container.querySelector('input[type="search"]')?.parentElement;
      expect(section).not.toBeNull();
      expect(toolbar?.contains(section)).toBe(false);
      expect(
        container.querySelector('section[aria-label="Work orders section"], header[data-column]')
      ).toBe(section);
      // Listed without a click.
      expect(button?.getAttribute('aria-expanded')).toBe('true');
      const list = container.querySelector('ul[aria-label="Work orders"]');
      expect(list?.id).toBe(button?.getAttribute('aria-controls') ?? '');
      expect(
        [...(list?.querySelectorAll('li[data-order]') ?? [])].map(row =>
          row.getAttribute('data-order')
        )
      ).toEqual(['48', '8']);

      // A row is one link to the order's page, its key and title; 48 has no title of its own.
      const row = list?.querySelector('li[data-order="48"]');
      expect(row?.textContent).toContain('0 of 3 merged');
      expect(row?.querySelectorAll('a')).toHaveLength(1);
      expect(row?.querySelector('a')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/items/48`
      );
      expect(row?.querySelector('a')?.textContent).toBe('#48Work order #48');
      expect(
        [...(row?.querySelectorAll('[role="img"][title]') ?? [])].map(dot =>
          dot.getAttribute('title')
        )
      ).toEqual(['#5: Running', '#4: Running', '#9: Waiting']);
      // An order with runs shows its key and its own title.
      const withRuns = list?.querySelector('li[data-order="8"]');
      expect(withRuns?.querySelectorAll('a')).toHaveLength(1);
      expect(withRuns?.querySelector('a')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/items/8`
      );
      expect(withRuns?.querySelector('a')?.textContent).toBe(`#8${realItem('8').progress!.title!}`);
      // A chip on each member card, none on the others.
      expect(card(container, '5')?.querySelector('a[href$="?order=48"]')?.textContent).toBe(
        'part of #48'
      );
      expect(card(container, '6')?.textContent).not.toContain('part of');

      // Lit on demand: every other card dims, and the header line names the order.
      const toggle = row?.querySelector('button[aria-pressed]') as HTMLButtonElement;
      expect(toggle.closest('a')).toBeNull();
      await act(async () => toggle.click());
      expect(toggle.getAttribute('aria-pressed')).toBe('true');
      expect(dimmed(container)).toHaveLength(PAGE.items.length - 2);
      expect((card(container, '5') as HTMLElement | null)?.dataset.dimmed).toBeUndefined();
      const line = summary(container)?.parentElement;
      expect(line?.textContent).toContain('highlighting #48');
      const clear = [...(line?.querySelectorAll('button') ?? [])].find(
        each => each.textContent === 'Clear highlight'
      );
      await act(async () => clear?.click());
      expect(summary(container)?.parentElement?.textContent).not.toContain('highlighting');
      expect(dimmed(container)).toHaveLength(0);

      // The header folds the list away.
      await act(async () => summary(container)?.click());
      expect(summary(container)?.getAttribute('aria-expanded')).toBe('false');
      expect(container.querySelector('li[data-order]')).toBeNull();
    } finally {
      await unmount();
    }
  });

  test.each([
    ['48', 'highlighting #48', PAGE.items.length - 2],
    ['nope', null, 0],
  ])(
    'an address naming work order %s lights its members, or nothing when no order has it',
    async (order, named, dimmedCount) => {
      const { container, unmount } = await mount(
        withOrders(),
        `/console/p/${ID}/factory/board?order=${order}`,
        members
      );
      try {
        const line = summary(container)?.parentElement?.textContent ?? '';
        if (named === null) expect(line).not.toContain('highlighting');
        else expect(line).toContain(named);
        expect(dimmed(container)).toHaveLength(dimmedCount);
      } finally {
        await unmount();
      }
    }
  );
});

test('a refetch marks the card it moved, the mark clears, and a failed refresh keeps the board', async () => {
  const { container, unmount } = await mount(PAGE.items);
  try {
    expect(container.querySelector('[data-moved]')).toBeNull();
    // Item 6 starts its deliver run: Build, then Checks once its review runs.
    const moved = PAGE.items.map(item =>
      item.item.key === '6' ? { ...realItem('8'), item: item.item } : item
    );
    await act(async () => {
      set(K.factoryItems(ID), { items: moved, members: {} });
    });
    expect([...container.querySelectorAll('[data-moved="true"]')].map(keyOf)).toEqual(['#6']);
    // A second read right after that moves nothing, as several node events bring while checks
    // start: the highlight still clears after its time.
    await act(async () => {
      set(K.factoryItems(ID), { items: structuredClone(moved), members: {} });
    });
    expect(container.querySelector('[data-moved="true"]')).not.toBeNull();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 1600));
    });
    expect(container.querySelector('[data-moved]')).toBeNull();

    // The refresh fetches, which this file's fetch refuses.
    const before = headers(container);
    await act(async () => invalidate(K.factoryItems(ID)));
    for (let turn = 0; turn < 5 && container.querySelector('[role="status"]') === null; turn++)
      await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      'Could not refresh: the board test fetched. Showing the last values read.'
    );
    expect(headers(container)).toEqual(before);
    expect(headers(container)).toContain('Merged3');
  } finally {
    await unmount();
  }
});

test('an item waiting on you with no ask open: its card and its row', async () => {
  const item = needsShaping('9s', ['Which surfaces?', 'Who owns it?']);
  const { container, unmount } = await mount([item]);
  try {
    const shaping = card(container, '9s');
    expect(shaping?.textContent).toContain('Needs shaping');
    // The first question on its line, and the count beside it, never clamped away.
    expect(shaping?.textContent).toContain('Which surfaces?2 questions');
    expect(shaping?.querySelector('[data-ping]')).toBeNull();
    await act(async () => viewButton(container, 'Table').click());
    const row = container.querySelector('tbody');
    expect(row?.textContent).toContain('Needs shaping');
    // The count stands apart from the question, as on the card, and is on hover too.
    const count = row?.querySelector('[data-stop-count]');
    expect(count?.textContent).toBe('2 questions');
    expect(count?.parentElement?.getAttribute('title')).toBe('Which surfaces? · 2 questions');
  } finally {
    await unmount();
  }
});

test('the captured page in the Table', async () => {
  const items = PAGE.items.map(item =>
    item.item.key === '5' ? { ...item, progress: { ...item.progress!, partOf: '48' } } : item
  );
  const { container, unmount } = await mount(items, `/console/p/${ID}/factory/board?view=table`);
  try {
    // One row per item, in board order: left to right, then the order the page lists them.
    expect(rowKeys(container)).toEqual(['5', '4', '6', '3', '8', '7', '2', '1']);
    const shown = [...container.querySelectorAll('thead th')].map(th =>
      (th.textContent ?? '').replace(/\s[↑↓]$/, '')
    );
    const cells = (key: string): Element[] => [
      ...(container.querySelector(`tbody tr[data-card="${key}"]`)?.querySelectorAll('td') ?? []),
    ];
    const text = (key: string, header: string): string =>
      cells(key)[shown.indexOf(header)]?.textContent ?? '';

    // The row's key links the item under its key, and reads #7 for a plain key.
    expect(container.querySelector('tbody tr a')?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/items/5`
    );
    const seven = container.querySelector('tbody tr[data-card="7"] td a');
    expect(seven?.textContent).toBe('#7');
    expect(seven?.getAttribute('href')).toBe(`/console/p/${ID}/factory/items/7`);

    // Column, then Stage. A merged row's Stage is empty: its Column and State already say merged.
    expect(shown.indexOf('Stage')).toBe(shown.indexOf('Column') + 1);
    expect([text('7', 'Column'), text('7', 'Stage')]).toEqual(['Merged', '']);
    // A running item's step folds into its Stage cell, as the card's stage line reads.
    expect(shown).not.toContain('Running step');
    expect([text('8', 'Column'), text('8', 'Stage')]).toEqual([
      'Checks & review',
      'ChecksProduct check · round 1',
    ]);
    // A cell after them still sits under its own header.
    expect(text('7', 'State')).toBe('Merged');

    // The Merged cell is short on its own terms: no year, no seconds, shorter than the full
    // time. The Table fits 1440x900 only while this holds. The full local time is on hover.
    const at = realItem('7').progress!.change!.mergedAt!;
    const merged = text('7', 'Merged');
    expect(merged).not.toContain(new Date(at).getFullYear().toString());
    expect(merged).toMatch(/ \d{2}:\d{2}$/);
    expect(merged.length).toBeLessThan(formatDateTime(at).length);
    expect(merged.length).toBeLessThanOrEqual(14);
    expect(
      cells('7')[shown.indexOf('Merged')]?.querySelector('[title]')?.getAttribute('title')
    ).toBe(formatDateTime(at));

    // The Work order cell sits under its header and links to the order's page.
    expect(shown.indexOf('Work order')).toBeGreaterThan(-1);
    expect(text('5', 'Work order')).toBe('#48');
    expect(cells('5')[shown.indexOf('Work order')]?.querySelector('a')?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/items/48`
    );
    expect(text('4', 'Work order')).toBe('');

    // A header click sorts by that field.
    const header = (label: string): HTMLButtonElement =>
      [...container.querySelectorAll('th button')].find(button =>
        button.textContent?.startsWith(label)
      ) as HTMLButtonElement;
    await act(async () => header('Item').click());
    expect(rowKeys(container)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    await act(async () => header('Item').click());
    expect(rowKeys(container)).toEqual(['8', '7', '6', '5', '4', '3', '2', '1']);
    await act(async () => header('Returned').click());
    expect(rowKeys(container)).toEqual(['5', '4', '6', '8', '7', '3', '2', '1']);
  } finally {
    await unmount();
  }
});

test('issue keys: the card and the Table row read #7 and #136 · item keys, links keep the key', async () => {
  // A split member of issue-136, through its order run's result.
  const member = keyed('issue-136-item-keys');
  member.progress = { ...member.progress!, partOf: 'issue-136' };
  const { container, unmount } = await mount([keyed('issue-7'), member]);
  try {
    for (const [key, shown] of [
      ['issue-7', '#7'],
      ['issue-136-item-keys', '#136 · item keys'],
    ] as const) {
      expect(keyOf(card(container, key))).toBe(shown);
      expect(card(container, key)?.querySelector('a[href*="/items/"]')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/items/${key}`
      );
    }
    await act(async () => viewButton(container, 'Table').click());
    for (const [key, shown] of [
      ['issue-7', '#7'],
      ['issue-136-item-keys', '#136 · item keys'],
    ] as const) {
      const link = container.querySelector(`tbody tr[data-card="${key}"] td a`);
      expect(link?.textContent).toBe(shown);
      expect(link?.getAttribute('href')).toBe(`/console/p/${ID}/factory/items/${key}`);
    }
  } finally {
    await unmount();
  }
});

test('the Merged column: the last 7 days, earlier merges behind a link', async () => {
  const old = mergedOn('old', new Date(2026, 10, 8, 9));
  const older = mergedOn('older', new Date(2026, 9, 1));
  const board = await mount([...PAGE.items, old, older]);
  try {
    const merged = columnNamed(board.container, 'Merged');
    expect(merged?.querySelector('header p')?.textContent).toBe('last 7 days');
    expect(headers(board.container)).toContain('Merged3');
    // Newest first.
    expect(cardKeys(merged as HTMLElement)).toEqual(['7', '2', '1']);
    const earlier = [...(merged?.querySelectorAll('a') ?? [])].find(link =>
      link.textContent?.includes('earlier')
    );
    expect(earlier?.textContent).toBe('2 earlier · show all');
    expect(earlier?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/board?view=table&show=landed`
    );
    // A merged card is compact: its change and when it merged, no round, no returned count.
    const change = realItem('7').progress!.change!;
    const seven = card(board.container, '7');
    expect(seven?.textContent).toContain(formatDateTime(change.mergedAt!));
    const prLink = [...(seven?.querySelectorAll('a') ?? [])].find(
      link => link.getAttribute('href') === change.url
    );
    expect(prLink?.textContent).toBe(`PR #${String(change.number)}`);
    expect(merged?.textContent).not.toContain('round');
    expect(merged?.textContent).not.toContain('returned');
  } finally {
    await board.unmount();
  }

  // A filter whose matches all merged earlier points to them.
  const filtered = await mount([old, older, realItem('7')]);
  try {
    await filterTo(filtered.container, 'old');
    const merged = columnNamed(filtered.container, 'Merged')?.textContent ?? '';
    expect(merged).toContain('No match merged in the last 7 days');
    expect(merged).not.toContain('No card here matches');
    expect(merged).toContain('2 earlier');
  } finally {
    await filtered.unmount();
  }

  // Only older merges: none in the last 7 days, never that the column is empty.
  const quietWeek = await mount([old, older]);
  try {
    const merged = columnNamed(quietWeek.container, 'Merged')?.textContent ?? '';
    expect(merged).toContain('Nothing merged in the last 7 days');
    expect(merged).not.toContain('Nothing in');
    expect(merged).toContain('2 earlier');
  } finally {
    await quietWeek.unmount();
  }
});

test('stacked on a phone, a column offers "show all N" until it is pressed', async () => {
  // Which cards a phone hides is CSS (checked in a browser at 390x844); every card is drawn.
  const five = ['a', 'b', 'c', 'd', 'e'].map(key => ({
    ...realItem('6'),
    item: { ...realItem('6').item, key },
  }));
  const { container, unmount } = await mount(five);
  try {
    const column = columnNamed(container, 'Plan & build');
    expect(column?.querySelectorAll('article')).toHaveLength(5);
    const showAll = () =>
      [...(column?.querySelectorAll('button') ?? [])].find(b => b.textContent === 'show all 5');
    expect(showAll()).toBeDefined();
    await act(async () => showAll()?.click());
    expect(showAll()).toBeUndefined();
    expect(column?.querySelectorAll('article')).toHaveLength(5);
  } finally {
    await unmount();
  }
});

test('while a merge state is pending: skeleton counts, the card says why, an unknown empty column shows skeletons', async () => {
  const board = await mount([...PAGE.items, readyWithMerge('p', 'pending')]);
  try {
    const shown = headers(board.container);
    expect(shown).toContain('Ready to mergechecking');
    expect(shown).toContain('Mergedchecking');
    expect(shown).toContain('Plan & build4');
    const ready = columnNamed(board.container, 'Ready to merge');
    expect(ready?.textContent).toContain('checking merge state');
    // No state chips while the count is not known: they would count what the skeleton hides.
    expect(ready?.querySelectorAll('header li')).toHaveLength(0);
  } finally {
    await board.unmount();
  }
  // Nothing merged is read yet and one change waits on its answer: Merged may gain it.
  const empty = await mount([realItem('6'), readyWithMerge('p', 'pending')]);
  try {
    const merged = columnNamed(empty.container, 'Merged');
    expect(merged?.querySelector('[data-skeleton]')).not.toBeNull();
    expect(merged?.textContent).not.toContain('Nothing in');
  } finally {
    await empty.unmount();
  }
});

describe('a board opened from a number', () => {
  test('?show=landed with the Table view: only landed rows; Show all brings back the rest', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?show=landed&view=table`
    );
    try {
      expect(rowKeys(container)).toEqual(['7', '2', '1']);
      expect(container.textContent).toContain('Showing: merged');
      const clear = container.querySelector(
        'button[aria-label="Show every item"]'
      ) as HTMLButtonElement;
      await act(async () => clear.click());
      expect(rowKeys(container)).toEqual(['5', '4', '6', '3', '8', '7', '2', '1']);
      expect(container.textContent).not.toContain('Showing:');
    } finally {
      await unmount();
    }
  });

  const model = () => boardModel(VIEW, ID, PAGE.items, new Map(), FIXTURE_NOW);

  test('"N of M merged": the Table of every item on the board, the merged ones marked', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?view=table&show=landed-of-all`
    );
    try {
      const { landed, total } = factoryNumbers(model(), NOW);
      expect(rowKeys(container)).toHaveLength(total);
      expect(rowKeys(container, 'tbody tr[data-mark="landed"]')).toHaveLength(landed);
      expect(rowKeys(container, 'tbody tr[data-mark="landed"]')).toEqual(['7', '2', '1']);
      expect(container.textContent).toContain('Showing: every item, merged ones marked');
      const clear = container.querySelector(
        'button[aria-label="Show every item"]'
      ) as HTMLButtonElement;
      await act(async () => clear.click());
      // Still the Table, unmarked; the folded ending is back.
      expect(container.querySelector('table')).not.toBeNull();
      expect(container.querySelector('tr[data-mark]')).toBeNull();
      expect(container.textContent).not.toContain('Showing:');
    } finally {
      await unmount();
    }
  });

  test('the median: merged rows by time to merge, the median row marked, the number checkable', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?view=table&show=median-to-land`
    );
    try {
      const placed = new Map(
        model()
          .columns.flatMap(column => column.cards)
          .map(card => [card.card.key, card])
      );
      const times = rowKeys(container).map(key => {
        const card = placed.get(key);
        return card === undefined ? null : timeToLand(card);
      });
      expect(times.length).toBeGreaterThan(1);
      // Ascending; a row with no time to merge after every time.
      const known = times.filter((time): time is number => time !== null);
      expect(known).toEqual([...known].sort((a, b) => a - b));
      expect(times.slice(known.length).every(time => time === null)).toBe(true);
      const marked = rowKeys(container, 'tbody tr[data-mark="median"]');
      expect(marked.length).toBeGreaterThan(0);
      const markedTimes = marked.map(key => timeToLand(placed.get(key)!) ?? NaN);
      const mean = markedTimes.reduce((sum, time) => sum + time, 0) / markedTimes.length;
      expect(mean).toBe(factoryNumbers(model(), NOW).medianToLandMs!);
      expect(container.querySelector('th[aria-sort="ascending"]')?.textContent).toContain(
        'To merge'
      );
      expect(container.querySelector('tr[data-mark="median"]')?.textContent).toContain('Median');
      expect(container.textContent).toContain('Showing: merged, by time to merge, median marked');
    } finally {
      await unmount();
    }
  });

  test('found by the factory: the whole board, the strips open, their line scrolled to once', async () => {
    const scrolled: Element[] = [];
    const proto = dom.HTMLElement.prototype as unknown as {
      scrollIntoView: (this: Element, options?: unknown) => void;
    };
    const original = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element): void {
      scrolled.push(this);
    };
    const closed = endLastRun(keepRuns(realItem('6'), 1), 'completed', 'fold');
    const { container, unmount } = await mount(
      [closed, ...PAGE.items.filter(item => item.item.key !== '6')],
      `/console/p/${ID}/factory/board?show=found`
    );
    try {
      expect(cardKeys(container)).toHaveLength(PAGE.items.length - 1);
      // Nothing narrowed: the set-aside line stays, as a show that narrows would hide it.
      expect(container.querySelector('#set-aside-heading')?.textContent).toBe('1 set aside');
      // The one toggle's state opened both strips.
      expect(stripsToggle(container)?.textContent).toBe('hide them');
      expect(container.querySelector('#found-by-the-factory-list')).not.toBeNull();
      expect(container.querySelector('#set-aside-list')).not.toBeNull();
      expect(container.textContent).toContain('Showing: found by the factory');
      // The line, not the findings: it holds both names, the shadow badge and the toggle.
      // By identity: a failing toEqual on a happy-dom Element hangs bun while it formats the diff.
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0] === container.querySelector('[data-board-strips]')).toBe(true);
      expect(scrolled[0]?.querySelector('#found-by-the-factory-heading')).not.toBeNull();
      expect(scrolled[0]?.textContent).toContain('shadow');
      // A view switch rewrites the address; it must not scroll the page away from the board.
      await act(async () => viewButton(container, 'Table').click());
      await act(async () => viewButton(container, 'Pipeline').click());
      // Nor does closing and reopening: the person asked for the strips, not to be moved.
      await act(async () => stripsToggle(container)?.click());
      await act(async () => stripsToggle(container)?.click());
      expect(container.querySelector('#found-by-the-factory-list')).not.toBeNull();
      expect(scrolled).toHaveLength(1);
    } finally {
      await unmount();
      proto.scrollIntoView = original;
    }
  });

  test('?show=needs-you: a column it empties says no card matches, never that it is empty', async () => {
    // Plan & build holds 4 items; none needs you.
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?show=needs-you`
    );
    try {
      const column = columnNamed(container, 'Plan & build')?.textContent ?? '';
      expect(column).toContain('No card here matches the filter');
      expect(column).not.toContain('Nothing in');
    } finally {
      await unmount();
    }
  });

  test('an unknown ?show= says so and filters nothing', async () => {
    const { container, unmount } = await mount(
      PAGE.items,
      `/console/p/${ID}/factory/board?show=bogus`
    );
    try {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Unknown filter "bogus"'
      );
      expect(cardKeys(container)).toHaveLength(PAGE.items.length);
    } finally {
      await unmount();
    }
  });
});
