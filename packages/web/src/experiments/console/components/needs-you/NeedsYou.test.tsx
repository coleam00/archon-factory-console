import { afterEach, describe, expect, jest, test } from 'bun:test';
import { act, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import { documentPageProblems } from '../../factory/document.test-helpers';
import { shippedListed } from '../../factory/item-detail.test-fixtures';
import { needsShaping } from '../../factory/lib/board.test-fixtures';
import { run, settledItem, type TestRun } from '../../factory/lib/map.test-fixtures';
import { DRY_RUN_CONTEXT, DRY_RUN_ROUTES, DRY_RUN_WHY } from '../../lib/ask-offered.test-fixtures';
import {
  askItem,
  gateItem,
  overdueWaitItem,
  usageLimitItem,
} from '../../lib/needs-you.test-fixtures';
import { projectRoutes } from '../../routes/project-routes';
import type { FactoryItem, FactoryViews } from '../../skills/factory';
import type { ItemRead } from '../../skills/items';
import type { AttentionQueue } from '../../skills/runs';
import { invalidate, set } from '../../store/cache';
import { K } from '../../store/keys';
import { installDom } from '../../test-dom.test-helpers';
import { ANSWERED_SHOWN_MS } from '../ask-card/useAnsweredHold';
import { NeedsYouContent } from './NeedsYouLayout';

const ID = 'cb-needs-design';
const { mount, settle } = await installDom();
const unserved = globalThis.fetch;

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = unserved;
  for (const prefix of ['factory-views', 'factory-items', 'runs', 'project']) invalidate(prefix);
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

/** The tab as the route draws it, parsed into a DOM to query. `unread` leaves the history unread. */
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
  const root = document.createElement('div');
  root.innerHTML = renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/console/p/${id}/needs-you`]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
  return root;
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
const panels = (root: Element, section: string): Element[] => [
  ...root.querySelectorAll(`section[data-needs-you="${section}"] article[data-doc-panel]`),
];

/** Item `key` whose set of asks settled at `at` and started `restarted`, when given. */
const answeredOn = (key: string, at: string, restarted?: TestRun): FactoryItem =>
  settledItem(key, run('plan', 'completed', 'ask'), at, restarted);

test("a busy page: chips count what waits and today's answers; one panel per item, one ping each", () => {
  const now = Date.now();
  const ago = (ms: number): string => new Date(now - ms).toISOString();
  const root = render(
    none,
    queueOf(
      askItem({ ref: 'ask:7a', item: seven, pausedAt: ago(20 * 60_000) }),
      askItem({
        ref: 'ask:9',
        item: nine,
        recommendation: undefined,
        pausedAt: ago(2 * 3_600_000),
      }),
      askItem({ ref: 'ask:7b', item: seven, message: 'Rebase?', pausedAt: ago(60_000) })
    ),
    [answeredOn('a', ago(0)), answeredOn('b', ago(7 * 86_400_000))]
  );
  const waiting = chip(root, 'waiting now');
  expect(chipWords(waiting)).toBe('3 waiting now');
  expect(waiting?.getAttribute('data-stat-chip')).toBe('needs-you');
  // `a`'s two answers today; its withdrawn one and `b`'s last week do not count.
  expect(chipWords(chip(root, 'answered today'))).toBe('2 answered today');
  // The longest any open ask has waited, whatever order they come in.
  expect(chipWords(chip(root, 'oldest wait'))).toBe('2 h oldest wait');

  const open = panels(root, 'open');
  expect(open.map(panel => panel.getAttribute('aria-label'))).toEqual(['Asks on #7', 'Asks on #9']);
  for (const panel of open) expect(panel.querySelectorAll('[data-ping]')).toHaveLength(1);
  expect(open[0]?.querySelectorAll('[data-ask]')).toHaveLength(2);
  expect(open[1]?.querySelectorAll('[data-recommended]')).toHaveLength(0);
});

describe('the tab with gates, a usage limit, a paused wait and an unreadable run', () => {
  /** Three asks on two items, a gate no item holds, and a usage limit, which needs no one. */
  const mixed: AttentionQueue = {
    ...queueOf(...busy.items, gateItem({ ref: 'gate:1' }), usageLimitItem()),
    degraded: [{ type: 'degraded', reason: 'run_unreadable', runId: 'r-x' }],
  } as AttentionQueue;

  test('without a view: Needs you first with its badge, counts, run links, the degraded sentence', () => {
    const root = render(none, mixed);
    const html = root.innerHTML;
    expect(html.match(/>(Needs you|Runs|Chat|Metrics|Factory)</g)).toEqual([
      '>Needs you<',
      '>Runs<',
      '>Chat<',
      '>Metrics<',
    ]);
    // Three asks and a gate; the usage limit retries by itself.
    expect(root.querySelector('[aria-label="4 waiting"]')).not.toBeNull();
    expect(text(root)).toContain('4 things need you');
    expect(text(root)).toContain('on 2 items and 1 run');
    expect(panels(root, 'open').map(panel => panel.getAttribute('aria-label'))).toEqual([
      'Asks on #7',
      'Asks on #9',
      'Asks on Run run-gate',
    ]);
    // Newest first under an item.
    const seventh = text(panels(root, 'open')[0]);
    expect(seventh.indexOf('Which base should the change target?')).toBeLessThan(
      seventh.indexOf('Rebase?')
    );
    expect(html).not.toContain('/factory/items/');
    expect(html).toContain(`href="/console/p/${ID}/r/run-gate"`);
    expect(text(root)).toContain(
      'One paused run could not be read, so what it waits on is not listed.'
    );
    // Nothing answered yet: the aside stays and says what appears there.
    expect(text(root.querySelector('section[aria-label="Answered lately"]'))).toContain(
      'Answers given here, from the CLI or by an agent, appear here.'
    );
  });

  test('a wait on a run no item holds is counted and named as a run, its workflow named once', () => {
    const root = render(none, queueOf(gateItem({ ref: 'gate:1' })));
    expect(text(root)).toContain('1 thing needs you');
    expect(text(root)).toContain('on 1 run');
    expect(root.querySelector('section[data-needs-you="paused"]')).toBeNull();
    const group = text(root.querySelector('[aria-label="Asks on Run run-gate"]'));
    expect(group.match(/deliver/g)).toHaveLength(1);
  });

  test('a wait past its deadline has its own section, says what it waits for, and does not ping', () => {
    const root = render(none, queueOf(askItem({ item: seven }), overdueWaitItem()));
    const paused = root.querySelector('section[data-needs-you="paused"]');
    expect(text(paused)).toContain('Waiting past their deadline');
    expect(text(paused)).toContain('CI on the change');
    expect(paused?.querySelector('[aria-label="Asks on #9"]')).not.toBeNull();
    expect(paused?.querySelector('[data-ping]')).toBeNull();
    expect(panels(root, 'open').map(panel => panel.getAttribute('aria-label'))).toEqual([
      'Asks on #7',
    ]);
    expect(chipWords(chip(root, 'waiting now'))).toBe('2 waiting now');
  });
});

describe('the empty state', () => {
  test.each([
    ['a view and an answer', withView, true, ['Open the board', 'See the runs']],
    ['no view, never asked', none, false, ['See the runs']],
  ] as const)('with %s', (_name, listing, answered, links) => {
    const items = answered ? [answeredOn('a', '2026-11-17T10:00:00.000Z')] : [];
    const root = render(listing, quiet, items);
    const empty = root.querySelector('section[aria-label="Nothing needs you"]');
    expect(text(empty)).toContain('Nothing needs you');
    expect(text(empty).includes('Last asked')).toBe(answered);
    expect(text(empty).includes('appears here to answer')).toBe(!answered);
    expect([...(empty?.querySelectorAll('a') ?? [])].map(text)).toEqual([...links]);
    if (answered)
      expect(empty?.querySelector('a')?.getAttribute('href')).toBe(
        `/console/p/${ID}/factory/board`
      );
    expect(chip(root, 'waiting now')?.getAttribute('data-stat-chip')).toBe('neutral');
    expect(chip(root, 'oldest wait')).toBeUndefined();
    expect(root.querySelector('section[data-needs-you]')).toBeNull();
  });
});

test('while the history is unread: skeletons for answered today, the aside and the empty line, never 0', () => {
  const page = render(none, busy, 'unread');
  const today = chip(page, 'answered today');
  expect(today?.querySelector('[data-skeleton="figure"]')).not.toBeNull();
  expect(chipWords(today)).toBe('answered today');
  const aside = page.querySelector('section[aria-label="Answered lately"]');
  expect(text(aside?.querySelector('[data-skeleton="true"]'))).toBe(
    'Loading what was answered lately'
  );
  const empty = render(none, quiet, 'unread').querySelector(
    'section[aria-label="Nothing needs you"]'
  );
  expect(empty?.querySelector('[data-skeleton="line"]')).not.toBeNull();
  expect(text(empty)).not.toContain('appears here to answer');
});

describe('answered lately', () => {
  const at = (hour: number): string => `2026-11-17T${hour.toString().padStart(2, '0')}:00:00.000Z`;
  const restarts: [string, TestRun | undefined][] = [
    ['none', undefined],
    ['pending', run('plan', 'pending', null)],
    ['running', run('plan', 'running', null, 'plan')],
    ['completed', run('plan', 'completed', 'planned')],
    ['failed', run('plan', 'failed', null)],
    ['paused', run('plan', 'paused', null)],
    ['cancelled', run('plan', 'cancelled', null)],
  ];
  const items = restarts.map(([key, restarted], index) =>
    answeredOn(key, at(index + 1), restarted)
  );

  test('one row per answer, newest first, saying what its set started', () => {
    const aside = render(none, quiet, items).querySelector('section[aria-label="Answered lately"]');
    const rows = [...(aside?.querySelectorAll('li') ?? [])];
    // Eight newest answers: cancelled's three, paused's three, failed's first two.
    expect(rows).toHaveLength(8);
    expect(text(rows[0])).toContain('cancelled');
    expect(text(rows[0]?.querySelector('[data-answer-pill]'))).toBe('Approve');
    expect(text(rows[0])).toContain('by cole-owner');
    expect(rows.some(row => text(row).includes('Withdrawn'))).toBe(true);
    for (const [key] of restarts) {
      const shown = render(
        none,
        quiet,
        items.filter(item => item.item.key === key)
      ).querySelector('section[aria-label="Answered lately"] li [data-started]');
      expect([key, text(key === 'none' ? shown : shown?.querySelector('a'))]).toEqual([
        key,
        key === 'none' ? 'Nothing started' : 'Plan started again',
      ]);
    }
  });

  /** Item `key`, asked by a stage-check run, its set's two answers choosing `chosen`. */
  const routed = (key: string, chosen: string, restarted: TestRun[]): FactoryItem => {
    const item = settledItem(key, run('stage-check', 'completed', 'ask'), at(1), restarted[0]);
    const extra = restarted.slice(1).map((entry, index) => ({
      ...item.runs[1],
      id: `run-${key}-again-${index.toString()}`,
      workflow: `Wirasm/archon-software-factory:${entry.workflow}`,
    }));
    return {
      ...item,
      runs: [...item.runs, ...extra] as FactoryItem['runs'],
      answers: item.answers.map(answer =>
        answer.kind === 'ask' && !answer.withdrawn
          ? { ...answer, chosen: { id: chosen, does: `Does ${chosen}.` } }
          : answer
      ),
    };
  };
  const startedOf = (root: Element): string[] =>
    [...root.querySelectorAll('section[aria-label="Answered lately"] li')].map(
      row =>
        `${text(row.querySelector('[data-answer-pill]'))} | ${text(row.querySelector('[data-started] a'))}`
    );

  test("a drop reads the view's sentence, linked to the one run it started; a send-back its stage", () => {
    const drop = render(withView, quiet, [routed('d', 'drop', [run('close', 'running')])]);
    expect(startedOf(drop)[0]).toBe('Drop | Closes the PR without merging');
    expect(drop.querySelector('[data-started] a')?.getAttribute('href')).toBe(
      `/console/p/${ID}/r/run-d-1`
    );
    const back = render(withView, quiet, [
      routed('b', 'send-back', [run('stage-build', 'running')]),
    ]);
    expect(startedOf(back)[0]).toBe('Send back | Build started again');
    // Two runs started, or none yet: the sentence, unlinked.
    for (const restarted of [[run('close', 'running'), run('stage-build', 'running')], []]) {
      const started = render(withView, quiet, [routed('d', 'drop', restarted)]).querySelector(
        'section[aria-label="Answered lately"] li [data-started]'
      );
      expect(text(started)).toBe('Closes the PR without merging');
      expect(started?.querySelector('a')).toBeNull();
    }
  });
});

describe('items waiting on you with no ask open', () => {
  const shaping = needsShaping('9s', ['Which surfaces?', 'Who owns it?']);

  test('each is a panel under Waiting on you, with its label, title, reason, next step and questions', () => {
    const root = render(withView, busy, [shaping]);
    const section = root.querySelector('section[data-needs-you="awaiting"]');
    const panel = section?.querySelector('article');
    for (const words of ['Needs shaping', '#9s', 'Worth doing; the scope is open.'])
      expect(text(panel)).toContain(words);
    expect(text(panel?.querySelector('[data-awaits-next]'))).toBe(
      `What to do ${shippedListed.declaration.awaits?.['triage:shape']?.next ?? '?'}`
    );
    expect([...(panel?.querySelectorAll('li') ?? [])].map(text)).toEqual([
      'Which surfaces?',
      'Who owns it?',
    ]);
    expect(panel?.querySelector('a')?.getAttribute('href')).toBe(
      `/console/p/${ID}/factory/items/9s`
    );
    // Only an open ask pings.
    expect(section?.querySelector('[data-ping]')).toBeNull();
    expect(chipWords(chip(root, 'waiting now'))).toBe('4 waiting now');
    expect(text(root.querySelector('section[aria-label="Summary"] h2'))).toBe('4 things need you');
    expect(text(root.querySelector('section[aria-label="Summary"]'))).toContain(
      '1 item waits on you with no question to answer here.'
    );
  });

  test('with no ask open the item still needs you; without a view there are none', () => {
    const root = render(withView, quiet, [shaping]);
    expect(root.querySelector('section[aria-label="Nothing needs you"]')).toBeNull();
    expect(chipWords(chip(root, 'waiting now'))).toBe('1 waiting now');
    const bare = render(none, quiet, [shaping]);
    expect(bare.querySelector('section[data-needs-you="awaiting"]')).toBeNull();
  });
});

describe('the page holds to the document-page rule, Answered lately last', () => {
  const offered = askItem({
    item: seven,
    context: DRY_RUN_CONTEXT,
    options: DRY_RUN_ROUTES,
    recommendation: { option: 'send-back', why: DRY_RUN_WHY },
  });
  test.each([
    [
      'open asks with an offered list',
      withView,
      queueOf(offered, askItem({ ref: 'ask:9', item: nine })),
      [],
    ],
    ['nothing open', none, quiet, []],
    ['a paused wait', none, queueOf(offered, overdueWaitItem()), []],
    ['an item waiting with no ask', withView, quiet, [needsShaping('9s', ['Which?'])]],
  ] as const)('%s', (_name, listing, queue, extra) => {
    const root = render(listing, queue, [answeredOn('a', '2026-11-17T10:00:00.000Z'), ...extra]);
    expect(documentPageProblems(root)).toEqual([]);
    const last = root.querySelector('[data-doc-page]')?.lastElementChild;
    expect(last?.getAttribute('aria-label')).toBe('Answered lately');
  });
});

describe('item keys on Needs you', () => {
  const KEY = 'issue-136-item-keys';
  /** `item` as a split member of `issue-136`, through an active part_of link. */
  const member = (item: FactoryItem): FactoryItem => ({
    ...item,
    links: [
      {
        id: 'link-136',
        kind: 'part_of',
        direction: 'outgoing',
        other: { id: 'item-136', projectKey: item.item.projectKey, key: 'issue-136' },
        at: '2026-11-17T10:00:00.000Z',
        via: 'cli',
        by: null,
        fromRun: null,
        ended: null,
      },
    ],
  });

  test.each([
    ['issue-7', '#7', (answered: FactoryItem) => answered],
    [KEY, '#136 · item keys', member],
  ])(
    '%s reads %s on its open ask and its answered row, whose links keep the key',
    (key, shown, shape) => {
      const answered = shape(answeredOn(key, '2026-11-17T10:00:00.000Z'));
      const open = render(withView, queueOf(askItem({ ref: `ask:${key}`, item: answered.item })), [
        answered,
      ]);
      const panel = panels(open, 'open')[0];
      expect(panel?.getAttribute('aria-label')).toBe(`Asks on ${shown}`);
      const link = panel?.querySelector('h3 a');
      expect(text(link)).toStartWith(shown);
      expect(link?.getAttribute('href')).toBe(`/console/p/${ID}/factory/items/${key}`);
      const row = render(withView, quiet, [answered]).querySelector(
        `section[aria-label="Answered lately"] li a[href="/console/p/${ID}/factory/items/${key}"]`
      );
      expect(text(row)).toContain(shown);
    }
  );
});

/** `NeedsYouContent` live, for a read that fails after the first render, and an answer's hold. */
async function mountLive(queue: AttentionQueue, serve: (url: string) => Promise<Response>) {
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => serve(String(input)), {
    preconnect: unserved.preconnect,
  });
  let setQueue: (next: AttentionQueue) => void = () => undefined;
  function Host() {
    const [current, setCurrent] = useState(queue);
    setQueue = setCurrent;
    return <NeedsYouContent projectId="cb-live" view={undefined} queue={current} />;
  }
  const page = await mount(
    <MemoryRouter>
      <Host />
    </MemoryRouter>
  );
  for (let turn = 0; turn < 5; turn++) await settle();
  return {
    ...page,
    rerender: (next: AttentionQueue): Promise<void> => act(async () => setQueue(next)),
    click: async (label: string): Promise<void> => {
      const button = [...page.container.querySelectorAll('button')].find(candidate =>
        candidate.textContent?.startsWith(label)
      );
      if (button === undefined) throw new Error(`No button "${label}"`);
      await act(async () => {
        button.click();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    done: async (): Promise<void> => {
      jest.useRealTimers();
      await page.unmount();
      invalidate('factory-items');
    },
  };
}

test('a history read that fails says so in the aside, and answered today is unknown, not 0', async () => {
  const page = await mountLive(quiet, async () => {
    throw new Error('the server is down');
  });
  try {
    const alert = text(
      page.container.querySelector('section[aria-label="Answered lately"] [role="alert"]')
    );
    expect(alert).toContain('What was answered lately could not be loaded');
    expect(alert).toContain('the server is down');
    expect(chipWords(chip(page.container, 'answered today'))).toBe('? answered today');
    expect(text(page.container)).not.toContain('appears here to answer');
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
