import { afterAll, afterEach, describe, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import { documentPageProblems } from '../../factory/document.test-helpers';
import { shippedListed } from '../../factory/item-detail.test-fixtures';
import { run, settledItem, type TestRun } from '../../factory/lib/map.test-fixtures';
import { DRY_RUN_CONTEXT, DRY_RUN_ROUTES, DRY_RUN_WHY } from '../../lib/ask-offered.test-fixtures';
import { askItem, gateItem, overdueWaitItem } from '../../lib/needs-you.test-fixtures';
import { projectRoutes } from '../../routes/project-routes';
import type { FactoryItem, FactoryViews } from '../../skills/factory';
import type { ItemRead } from '../../skills/items';
import type { AttentionQueue } from '../../skills/runs';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { ANSWERED_SHOWN_MS } from '../ask-card/useAnsweredHold';

const ID = 'cb-needs-design';
const dom = new Window({ url: 'http://localhost' });

afterEach(() => {
  for (const prefix of ['factory-views', 'factory-items', 'runs', 'project']) invalidate(prefix);
});
afterAll(async () => {
  await dom.happyDOM.close();
});

const none: FactoryViews = { views: [], errors: [] };
const withView: FactoryViews = { views: [shippedListed], errors: [] };
const seven = { id: 'item-7', projectKey: 'acme', key: '#7' };
const nine = { id: 'item-9', projectKey: 'acme', key: '#9' };
const queueOf = (...items: AttentionQueue['items']): AttentionQueue => ({
  items,
  runs: [],
  degraded: [],
});
const quiet = queueOf();
/** Two asks on #7, one on #9 with no recommendation. */
const busy = queueOf(
  askItem({ ref: 'ask:7a', item: seven, pausedAt: '2026-11-16T09:00:00.000Z' }),
  askItem({
    ref: 'ask:9',
    item: nine,
    message: 'Split it?',
    recommendation: undefined,
    pausedAt: '2026-11-15T09:00:00.000Z',
  }),
  askItem({ ref: 'ask:7b', item: seven, message: 'Rebase?', pausedAt: '2026-11-14T09:00:00.000Z' })
);

const windowRead = (items: FactoryItem[]): ItemRead[] =>
  items.map(({ progress: _progress, ...read }) => read);

/**
 * The tab as the route draws it, parsed into a DOM to query. `unread` leaves the history
 * unread.
 */
let unread = 0;
function render(
  listing: FactoryViews,
  queue: AttentionQueue,
  items: FactoryItem[] | 'unread' = []
): Element {
  // A project of its own when unread: the cache keeps a value it has once held.
  const id = items === 'unread' ? `${ID}-unread-${(unread++).toString()}` : ID;
  set(K.factoryViews(id), listing);
  set(K.projectAttention(id), queue);
  if (items !== 'unread') {
    set(K.factoryItems(id), { items, members: {} });
    set(K.projectItems(id), windowRead(items));
  }
  const root = dom.document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/console/p/${id}/needs-you`]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
  return root as unknown as Element;
}
const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const chip = (root: Element, label: string): Element | undefined =>
  [...root.querySelectorAll('[data-stat-chip]')].find(el => text(el).endsWith(label));
/** A chip's figure and label, as a person reads them. */
const chipWords = (el: Element | undefined): string =>
  [...(el?.childNodes ?? [])]
    .map(node => text(node as Element))
    .join(' ')
    .trim();

/** Item `key` whose set of asks settled at `at` and started `restarted`, when given. */
const answeredOn = (key: string, at: string, restarted?: TestRun): FactoryItem =>
  settledItem(key, run('plan', 'completed', 'ask'), at, restarted);

describe('the header band', () => {
  test("counts what waits, in the needs-you colour, how long the oldest has waited, and today's answers", () => {
    const now = Date.now();
    const today = new Date(now).toISOString();
    const lastWeek = new Date(now - 7 * 86_400_000).toISOString();
    const root = render(none, busy, [answeredOn('a', today), answeredOn('b', lastWeek)]);
    const band = root.querySelector('[data-doc-page] > section[aria-label="Summary"]');
    expect(text(band?.querySelector('h2'))).toBe('3 things need you');
    expect(text(band)).toContain('on 2 items');
    const waiting = chip(root, 'waiting now');
    expect(chipWords(waiting)).toBe('3 waiting now');
    expect(waiting?.getAttribute('data-stat-chip')).toBe('needs-you');
    // The oldest, #7's rebase, paused on 2026-11-14: days ago, in words with units.
    expect(chipWords(chip(root, 'oldest wait'))).toMatch(/^\d+ d( \d+ h)? oldest wait$/);
    // `a`'s two answers today; its withdrawn one and `b`'s last week do not count.
    expect(chipWords(chip(root, 'answered today'))).toBe('2 answered today');
  });

  test('with nothing open it says so, its count neutral, and no oldest wait', () => {
    const root = render(none, quiet);
    expect(text(root.querySelector('section[aria-label="Summary"] h2'))).toBe('Nothing needs you');
    expect(chip(root, 'waiting now')?.getAttribute('data-stat-chip')).toBe('neutral');
    expect(chip(root, 'oldest wait')).toBeUndefined();
    expect(chipWords(chip(root, 'answered today'))).toBe('0 answered today');
  });

  test('while the history is unread, answered today is a skeleton, never 0', () => {
    const root = render(none, busy, 'unread');
    const today = chip(root, 'answered today');
    expect(today?.querySelector('[data-skeleton="figure"]')).not.toBeNull();
    expect(chipWords(today)).toBe('answered today');
  });
});

describe('open asks', () => {
  test('grouped by item: one panel per item with the needs-you bar and one ping, its asks inside', () => {
    const root = render(none, busy);
    const open = root.querySelector('section[data-needs-you="open"]');
    const panels = [...(open?.querySelectorAll('article[data-doc-panel]') ?? [])];
    expect(panels.map(panel => panel.getAttribute('aria-label'))).toEqual([
      'Asks on #7',
      'Asks on #9',
    ]);
    for (const panel of panels) {
      expect(panel.getAttribute('style')).toContain('--doc-tone:var(--warning)');
      expect(panel.querySelectorAll('[data-doc-bar="left"]')).toHaveLength(1);
      expect(panel.querySelectorAll('[data-ping]')).toHaveLength(1);
    }
    expect(panels[0]?.querySelectorAll('[data-ask]')).toHaveLength(2);
    // #9's ask recommends nothing: it still carries the bar and the ping.
    expect(panels[1]?.querySelectorAll('[data-recommended]')).toHaveLength(0);
    // The question in the primary text colour.
    expect(panels[0]?.querySelector('[data-ask] h3')?.className).toContain('text-text-primary');
  });

  test('the stage that asked heads each ask, in its group colour with a view, tertiary without', () => {
    const tones = (listing: FactoryViews): (string | null | undefined)[] =>
      [...render(listing, queueOf(gateItem())).querySelectorAll('[data-ask-stage]')].map(el =>
        el.getAttribute('style')
      );
    // `deliver` begins on Build, which is in the build group.
    expect(tones(withView)).toEqual(['color:var(--node-wait)']);
    expect(tones(none)).toEqual(['color:var(--text-tertiary)']);
  });

  test('a gate no item holds sits in open asks, named as its run', () => {
    const root = render(none, queueOf(gateItem()));
    const open = root.querySelector('section[data-needs-you="open"]');
    expect(open?.querySelector('[aria-label="Asks on Run run-gate"]')).not.toBeNull();
  });
});

describe('paused waits', () => {
  test('a wait past its deadline has its own section, with what it waits for, and no ping', () => {
    const root = render(none, queueOf(askItem({ item: seven }), overdueWaitItem()));
    const paused = root.querySelector('section[data-needs-you="paused"]');
    const open = root.querySelector('section[data-needs-you="open"]');
    expect(text(paused)).toContain('Waiting past their deadline');
    expect(text(paused)).toContain('CI on the change');
    expect(paused?.querySelector('[aria-label="Asks on #9"] [data-doc-bar="left"]')).not.toBeNull();
    expect(paused?.querySelector('[data-ping]')).toBeNull();
    expect(open?.querySelector('[aria-label="Asks on #9"]')).toBeNull();
    // Both count as waiting.
    expect(chipWords(chip(root, 'waiting now'))).toBe('2 waiting now');
  });
});

describe('answered lately', () => {
  const at = (hour: number): string => `2026-11-17T${hour.toString().padStart(2, '0')}:00:00.000Z`;
  const restarts: [string, TestRun | undefined, string][] = [
    ['none', undefined, 'text-text-tertiary'],
    ['pending', run('plan', 'pending', null), 'text-[color:var(--running)]'],
    ['running', run('plan', 'running', null, 'plan'), 'text-[color:var(--running)]'],
    ['completed', run('plan', 'completed', 'planned'), 'text-success'],
    ['failed', run('plan', 'failed', null), 'text-error'],
    ['paused', run('plan', 'paused', null), 'text-warning'],
    ['cancelled', run('plan', 'cancelled', null), 'text-text-tertiary'],
  ];
  const items = restarts.map(([key, restarted], index) =>
    answeredOn(key, at(index + 1), restarted)
  );

  for (const listing of [none, withView])
    test(`one compact row per answer, with what its set started in that state's colour (${listing === none ? 'no view' : 'a view'})`, () => {
      const root = render(listing, quiet, items);
      const aside = root.querySelector('section[aria-label="Answered lately"]');
      const rows = [...(aside?.querySelectorAll('li') ?? [])];
      // Eight newest answers: cancelled's three, paused's three, failed's first two.
      expect(rows).toHaveLength(8);
      // Rows, not boxes: one panel holds them all.
      expect(aside?.querySelectorAll('[data-doc-panel]')).toHaveLength(1);
      const first = rows[0];
      expect(text(first)).toContain('cancelled');
      expect(text(first?.querySelector('[data-answer-pill]'))).toBe('Approve');
      expect(text(first)).toContain('by cole-owner');
      // The withdrawn answer of the set reads as withdrawn, struck through.
      expect(rows.some(row => row.querySelector('.line-through') !== null)).toBe(true);
      for (const [key, , color] of restarts) {
        const shown = renderStarted(listing, key, items);
        if (key === 'none') {
          expect(text(shown)).toBe('Nothing started');
          expect(shown?.className).toContain(color);
        } else {
          expect(text(shown?.querySelector('a'))).toBe('Plan started again');
          expect(shown?.querySelector('a')?.className).toContain(color);
        }
      }
    });

  /** The "what it started" of item `key`'s newest row, drawn with that item alone answered. */
  function renderStarted(listing: FactoryViews, key: string, all: FactoryItem[]): Element | null {
    const only = all.filter(item => item.item.key === key);
    return render(listing, quiet, only).querySelector(
      'section[aria-label="Answered lately"] li [data-started]'
    );
  }

  test('with nothing answered yet, the aside stays and says what appears there', () => {
    const aside = render(none, busy).querySelector('section[aria-label="Answered lately"]');
    expect(text(aside)).toContain('Answers given here, from the CLI or by an agent appear here.');
  });

  test('while the history is unread it shows skeleton rows', () => {
    const aside = render(none, busy, 'unread').querySelector(
      'section[aria-label="Answered lately"]'
    );
    expect(text(aside?.querySelector('[data-skeleton="true"]'))).toBe(
      'Loading what was answered lately'
    );
    // Lines a shade off the panel's fill, so they show on it.
    expect(aside?.querySelectorAll('.bg-surface-hover').length).toBeGreaterThan(0);
  });
});

describe('the empty state', () => {
  test('a check in a soft success tint, "Nothing needs you", when last asked, the board and the runs', () => {
    const root = render(withView, quiet, [answeredOn('a', '2026-11-17T10:00:00.000Z')]);
    const empty = root.querySelector('section[aria-label="Nothing needs you"]');
    expect(empty?.getAttribute('data-doc-panel')).toBe('panel');
    expect(empty?.querySelector('[data-empty-icon]')?.className).toContain('var(--success-soft)');
    expect(text(empty)).toContain('Nothing needs you');
    expect(text(empty)).toContain('Last asked');
    const links = [...(empty?.querySelectorAll('a') ?? [])].map(a => [
      text(a),
      a.getAttribute('href'),
    ]);
    expect(links).toEqual([
      ['Open the board', `/console/p/${ID}/factory/board`],
      ['See the runs', `/console/p/${ID}`],
    ]);
    expect(root.querySelector('section[data-needs-you]')).toBeNull();
  });

  test('without a view there is no board to link; never asked, it says what appears here', () => {
    const empty = render(none, quiet).querySelector('section[aria-label="Nothing needs you"]');
    expect(text(empty)).not.toContain('Last asked');
    expect(text(empty)).toContain('appears here to answer');
    expect([...(empty?.querySelectorAll('a') ?? [])].map(text)).toEqual(['See the runs']);
  });

  test('while the history is unread, a skeleton bar, never the never-asked sentence', () => {
    const empty = render(none, quiet, 'unread').querySelector(
      'section[aria-label="Nothing needs you"]'
    );
    expect(empty?.querySelector('[data-skeleton="line"] .bg-surface-hover')).not.toBeNull();
    expect(text(empty)).not.toContain('appears here to answer');
  });
});

describe('the page holds to the document-page rule', () => {
  const offered = askItem({
    item: seven,
    context: DRY_RUN_CONTEXT,
    options: DRY_RUN_ROUTES,
    recommendation: { option: 'send-back', why: DRY_RUN_WHY },
  });
  const cases: [string, FactoryViews, AttentionQueue][] = [
    [
      'open asks with an offered list',
      withView,
      queueOf(offered, askItem({ ref: 'ask:9', item: nine })),
    ],
    ['nothing open', none, quiet],
    [
      'a paused wait and a run it could not read',
      none,
      {
        ...queueOf(offered, overdueWaitItem()),
        degraded: [{ type: 'degraded', reason: 'run_unreadable', runId: 'r-x' }],
      } as AttentionQueue,
    ],
  ];
  for (const [name, listing, queue] of cases)
    test(name, () => {
      const root = render(listing, queue, [answeredOn('a', '2026-11-17T10:00:00.000Z')]);
      expect(documentPageProblems(root)).toEqual([]);
      // Answered lately is the aside, after the main column, at 390 px as at 1440.
      const page = root.querySelector('[data-doc-page]');
      const last = page?.lastElementChild;
      expect(last?.getAttribute('aria-label')).toBe('Answered lately');
      expect(last?.className).toContain('lg:col-start-3');
    });
});

/**
 * `NeedsYouContent` mounted in a live DOM, for what static markup cannot reach: a read that
 * fails after the first render, an answer and its hold. `fetch` answers every request.
 */
async function mountLive(
  queue: AttentionQueue,
  fetch: (url: string) => Promise<Response>
): Promise<{
  container: HTMLElement;
  rerender: (next: AttentionQueue) => Promise<void>;
  click: (label: string) => Promise<void>;
  done: () => Promise<void>;
}> {
  const originalFetch = globalThis.fetch;
  const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
  const descriptors = new Map(
    Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  for (const [key, value] of Object.entries(globals))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => fetch(String(input)), {
    preconnect: originalFetch.preconnect,
  });
  const { createRoot } = await import('react-dom/client');
  const { NeedsYouContent } = await import('./NeedsYouLayout');
  const container = dom.document.createElement('div') as unknown as HTMLElement;
  dom.document.body.append(container as never);
  const root = createRoot(container);
  const draw = async (current: AttentionQueue): Promise<void> =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <NeedsYouContent projectId="cb-live" view={undefined} queue={current} />
        </MemoryRouter>
      )
    );
  await draw(queue);
  for (let turn = 0; turn < 5; turn++)
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  return {
    container,
    rerender: draw,
    click: async label => {
      const button = [...container.querySelectorAll('button')].find(candidate =>
        candidate.textContent?.startsWith(label)
      );
      if (button === undefined) throw new Error(`No button "${label}"`);
      await act(async () => {
        button.click();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    done: async () => {
      jest.useRealTimers();
      await act(async () => root.unmount());
      container.remove();
      invalidate('factory-items');
      globalThis.fetch = originalFetch;
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('a history read that fails says so in the aside, and answered today is unknown, not 0', async () => {
  const page = await mountLive(quiet, async () => {
    throw new Error('the server is down');
  });
  try {
    const { container } = page;
    const alert = text(
      container.querySelector('section[aria-label="Answered lately"] [role="alert"]')
    );
    expect(alert).toContain('What was answered lately could not be loaded');
    expect(alert).toContain('the server is down');
    expect(chipWords(chip(container, 'answered today'))).toBe('? answered today');
    expect(text(container)).not.toContain('appears here to answer');
  } finally {
    await page.done();
  }
});

test('answering the last ask keeps it in its panel, saying so, before the empty state', async () => {
  const page = await mountLive(queueOf(askItem({ ref: 'ask:1', item: seven })), async url =>
    url.includes('/api/attention/answer')
      ? Response.json({ success: true })
      : Response.json({ error: 'not in this test' }, { status: 404 })
  );
  try {
    const { container } = page;
    jest.useFakeTimers();
    await page.click('Use dev');
    await page.click('Confirm');
    // The queue refreshes without the ask; its panel stays, saying what was answered.
    await page.rerender(quiet);
    const panel = container.querySelector('[aria-label="Asks on #7"]');
    expect(text(panel?.querySelector('[role="status"]'))).toBe('Answered: Use dev');
    expect(container.querySelector('section[aria-label="Nothing needs you"]')).toBeNull();
    expect(chipWords(chip(container, 'waiting now'))).toBe('0 waiting now');
    await act(async () => {
      jest.advanceTimersByTime(ANSWERED_SHOWN_MS);
    });
    expect(container.querySelector('[aria-label="Asks on #7"]')).toBeNull();
    expect(container.querySelector('section[aria-label="Nothing needs you"]')).not.toBeNull();
  } finally {
    await page.done();
  }
});
