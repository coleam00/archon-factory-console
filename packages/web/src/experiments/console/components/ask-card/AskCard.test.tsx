import { afterAll, afterEach, expect, jest, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { askItem, gateItem } from '../../lib/needs-you.test-fixtures';
import type { NeedsYouItem } from '../../lib/needs-you';
import { toRun } from '../../primitives/run';
import { get, set } from '../../store/cache';
import { K } from '../../store/keys';
import { AskCard } from './AskCard';
import { AskGroup } from './AskGroup';
import { ANSWERED_SHOWN_MS } from './useAnsweredHold';
import { holding, LONG, wrapsAnywhere } from './wrap.test-fixtures';

// Choosing, confirming and folding re-render the card, which static markup cannot reach.
const dom = new Window({ url: 'http://localhost' });
const globals = { window: dom, document: dom.document, IS_REACT_ACT_ENVIRONMENT: true };
const descriptors = new Map(
  Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
);
for (const [key, value] of Object.entries(globals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { createRoot } = await import('react-dom/client');
const originalFetch = globalThis.fetch;

afterEach(() => {
  jest.useRealTimers();
  globalThis.fetch = originalFetch;
});
afterAll(async () => {
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

/** Every request the card sends, by path, with its body. */
function serve(answer: () => Response = () => Response.json({ success: true })) {
  const requests: { path: string; body: unknown }[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ path: String(input), body: JSON.parse(String(init?.body)) });
      return answer();
    },
    { preconnect: originalFetch.preconnect }
  );
  return requests;
}

/**
 * One item's asks, as a popover over a board card would mount them: the group alone, with
 * its props and no page, route or provider around it (a router only for its links).
 */
async function mount(asks: NeedsYouItem[], runs: ReturnType<typeof toRun>[] = []) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const render = (current: NeedsYouItem[]): ReactElement => (
    <MemoryRouter>
      <AskGroup projectId="cb-1" asks={current} queue={{ runs }} />
    </MemoryRouter>
  );
  await act(async () => root.render(render(asks)));
  const button = (label: string): HTMLButtonElement => {
    const found = [...container.querySelectorAll('button')].find(candidate =>
      candidate.textContent?.startsWith(label)
    );
    if (found === undefined) throw new Error(`No button "${label}"`);
    return found;
  };
  return {
    container,
    button,
    click: async (label: string): Promise<void> => {
      await act(async () => {
        button(label).click();
        await Promise.resolve();
        await Promise.resolve();
      });
    },
    type: async (text: string): Promise<void> => {
      const box = container.querySelector('textarea');
      if (box === null) throw new Error('No textarea');
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(box) as object,
          'value'
        )?.set;
        setter?.call(box, text);
        box.dispatchEvent(new dom.Event('input', { bubbles: true }) as unknown as Event);
      });
    },
    rerender: async (current: NeedsYouItem[]): Promise<void> => {
      await act(async () => root.render(render(current)));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test('a tile sends nothing; it shows Answer: <label>, Cancel clears it, Confirm answers by ref', async () => {
  const requests = serve();
  const card = await mount([askItem({ ref: 'ask:1' })]);
  try {
    await card.click('Use main');
    expect(requests).toEqual([]);
    expect(card.container.textContent).toContain('Answer: Use main');
    await card.click('Cancel');
    expect(card.container.textContent).not.toContain('Answer: Use main');

    await card.click('Use dev');
    await card.type('On dev, please.');
    await card.click('Confirm');
    expect(requests).toEqual([
      {
        path: '/api/attention/answer',
        body: { ref: 'ask:1', choose: ['use-dev'], text: 'On dev, please.' },
      },
    ]);
  } finally {
    await card.unmount();
  }
});

test('a chosen tile shows what its option does and costs whole, not only in a tooltip', async () => {
  serve();
  const long =
    'The merged change contradicts DESIGN.md on a member page and can list a refused order as members.';
  const ask = askItem({
    ref: 'ask:1',
    options: [
      { id: 'use-main', label: 'Use main', does: 'Rebases onto main.', cost: long },
      { id: 'use-dev', label: 'Use dev', does: 'Rebases onto dev.', cost: 'One more rebase.' },
    ],
  });
  const card = await mount([ask]);
  try {
    const costLine = (): HTMLElement | undefined =>
      [...card.button('Use main').querySelectorAll('span')].find(span =>
        span.textContent?.startsWith('Cost:')
      );
    // At rest it clamps to 2 lines; chosen, the cost is text in full, unclamped.
    expect(costLine()?.className).toContain('line-clamp-2');
    await card.click('Use main');
    expect(costLine()?.textContent).toBe(`Cost: ${long}`);
    expect(costLine()?.className).not.toContain('line-clamp');
  } finally {
    await card.unmount();
  }
});

test('once answered the card says so in place, then folds away after 5 s', async () => {
  serve();
  const ask = askItem({ ref: 'ask:1' });
  const card = await mount([ask]);
  try {
    jest.useFakeTimers();
    await card.click('Use dev');
    await card.click('Confirm');
    // The queue refreshes without the ask; the card stays, saying what was answered.
    await card.rerender([]);
    expect(card.container.querySelector('[role="status"]')?.textContent).toBe('Answered: Use dev');
    expect(card.container.querySelector('[aria-label="Options"]')).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(ANSWERED_SHOWN_MS - 1);
    });
    expect(card.container.textContent).toContain('Answered: Use dev');
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(card.container.querySelector('[data-ask]')).toBeNull();
  } finally {
    await card.unmount();
  }
});

test('an answered card keeps its place among asks paused at the same time', async () => {
  serve();
  const first = askItem({ ref: 'ask:1', message: 'First?' });
  const second = askItem({ ref: 'ask:2', message: 'Second?' });
  const card = await mount([first, second]);
  try {
    await card.click('Use dev');
    await card.click('Confirm');
    await card.rerender([second]);
    const order = [...card.container.querySelectorAll('[data-ask]')].map(node =>
      node.getAttribute('data-ask')
    );
    expect(order).toEqual(['ask:1', 'ask:2']);
  } finally {
    await card.unmount();
  }
});

test("a refusal shows the server's words in the card, which stays open, and the queue refreshes", async () => {
  const refusal = "Item 'ask:gone' is no longer open";
  serve(() => Response.json({ error: refusal }, { status: 409 }));
  set(K.projectAttention('cb-1'), { items: [], runs: [], degraded: [] });
  const card = await mount([askItem({ ref: 'ask:gone' })]);
  try {
    await card.click('Use dev');
    await card.click('Confirm');
    expect(card.container.querySelector('[role="alert"]')?.textContent).toBe(refusal);
    expect(card.container.textContent).toContain('Answer: Use dev');
    // No subscriber holds the key here, so the refresh drops the cached queue.
    expect(get(K.projectAttention('cb-1'))).toBeUndefined();
  } finally {
    await card.unmount();
  }
});

test('a gate draws its decisions as tiles and responds through the gate, reasons required', async () => {
  const requests = serve();
  const gate = gateItem({ ref: 'gate:1' });
  const run = toRun({
    id: 'run-gate',
    workflow_name: 'deliver',
    codebase_id: 'cb-1',
    status: 'paused',
    started_at: '2026-11-16T09:00:00.000Z',
    metadata: {
      approval: {
        nodeId: 'review',
        message: 'Approve the plan?',
        type: 'approval',
        decisions: [{ id: 'approve' }, { id: 'reject' }],
      },
    },
  });
  const card = await mount([gate], [run]);
  try {
    expect(card.container.textContent).toContain('Approve the plan?');
    await card.click('Reject');
    expect(card.button('Confirm').disabled).toBe(true);
    await card.type('The plan skips the migration.');
    await card.click('Confirm');
    expect(requests).toEqual([
      {
        path: '/api/workflows/runs/run-gate/respond',
        body: { decision: 'reject', text: 'The plan skips the migration.' },
      },
    ]);
  } finally {
    await card.unmount();
  }
});

/** The option tiles, in the order drawn. */
const tiles = (container: HTMLElement): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>('[aria-label="Options"] button'),
];
/** A tile drawn as chosen: the accent border (the whole class, not `border-accent-muted`) or the check. */
const looksSelected = (tile: HTMLElement): boolean =>
  tile.classList.contains('border-accent') || tile.querySelector('svg') !== null;

test('before any pick nothing looks selected; the recommended tile is green with its badge', async () => {
  serve();
  const card = await mount([
    askItem({
      options: [
        { id: 'use-main', label: 'Use main' },
        { id: 'use-dev', label: 'Use dev' },
        { id: 'use-next', label: 'Use next' },
        { id: 'skip', label: 'Skip it' },
      ],
    }),
  ]);
  try {
    const all = tiles(card.container);
    expect(all.length).toBe(4);
    expect(all.filter(looksSelected)).toEqual([]);
    const recommended = all.filter(tile => tile.dataset.recommended === 'true');
    expect(recommended.map(tile => tile.textContent?.startsWith('Use dev'))).toEqual([true]);
    expect(recommended[0]?.classList.contains('bg-[color:var(--success-soft)]')).toBe(true);
    expect(recommended[0]?.classList.contains('border-success/40')).toBe(true);
    expect(recommended[0]?.textContent).toContain('Recommended');
  } finally {
    await card.unmount();
  }
});

test('picking a tile the ask does not recommend: that tile alone looks selected', async () => {
  serve();
  const card = await mount([askItem()]);
  try {
    await card.click('Use main');
    const all = tiles(card.container);
    const selected = all.filter(looksSelected);
    expect(selected.map(tile => tile.textContent?.startsWith('Use main'))).toEqual([true]);
    expect(all.filter(tile => tile.getAttribute('aria-pressed') === 'true')).toEqual(selected);
    // No other tile wears the chosen tile's look.
    expect(all.filter(tile => tile.className === selected[0]?.className).length).toBe(1);
    // The recommended tile keeps only its green mark.
    const recommended = card.button('Use dev');
    expect(looksSelected(recommended)).toBe(false);
    expect(recommended.classList.contains('border-success/40')).toBe(true);
  } finally {
    await card.unmount();
  }
});

test('picking the recommended tile: selected, keeping its badge, with one border colour', async () => {
  serve();
  const card = await mount([askItem()]);
  try {
    await card.click('Use dev');
    const tile = card.button('Use dev');
    expect(tiles(card.container).filter(looksSelected)).toEqual([tile]);
    expect(tile.classList.contains('border-accent')).toBe(true);
    expect(tile.classList.contains('border-success/40')).toBe(false);
    expect(tile.textContent).toContain('Recommended');
  } finally {
    await card.unmount();
  }
});

test('Confirm is the accent at reduced strength, never the full-strength block', async () => {
  serve();
  const card = await mount([askItem()]);
  try {
    await card.click('Use main');
    const confirm = card.button('Confirm');
    expect(confirm.classList.contains('bg-[color:var(--accent-soft)]')).toBe(true);
    expect(confirm.classList.contains('text-accent')).toBe(true);
    expect(confirm.classList.contains('bg-accent')).toBe(false);
    expect(confirm.classList.contains('text-white')).toBe(false);
  } finally {
    await card.unmount();
  }
});

test('a long unbroken path in every text field wraps inside its tile and the card', async () => {
  serve();
  const [question, context, label, does, cost, why] = [
    'question',
    'context',
    'label',
    'does',
    'cost',
    'why',
  ].map(field => `${field}:${LONG}`) as [string, string, string, string, string, string];
  const card = await mount([
    askItem({
      message: question,
      context,
      options: [
        { id: 'long', label, does, cost },
        { id: 'use-dev', label: 'Use dev' },
      ],
      recommendation: { option: 'use-dev', why },
    }),
  ]);
  try {
    const article = card.container.querySelector('article[data-ask]');
    if (article === null) throw new Error('No card');
    const tile = card.button(label);
    const inTile = [label, does, cost];
    for (const text of [question, context, label, does, cost, why]) {
      const found = holding(article, text);
      expect(found.length).toBeGreaterThan(0);
      const box = inTile.includes(text) ? tile : article;
      for (const el of found) expect([text, wrapsAnywhere(el, box)]).toEqual([text, true]);
    }
    expect(article.classList.contains('min-w-0')).toBe(true);
    for (const each of tiles(card.container))
      expect(each.classList.contains('max-w-full')).toBe(true);
    // Chosen, the tile shows its words whole; they still wrap.
    await card.click(label);
    for (const text of inTile)
      for (const el of holding(tile, text)) expect(wrapsAnywhere(el, tile)).toBe(true);
  } finally {
    await card.unmount();
  }
});

test("the Overview's compact card wraps a long question and label, and marks the tile green", async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const question = `question:${LONG}`;
  const label = `label:${LONG}`;
  try {
    await act(async () =>
      root.render(
        <MemoryRouter>
          <AskCard
            projectId="cb-1"
            ask={askItem({
              message: question,
              options: [{ id: 'long', label }],
              recommendation: { option: 'long', why: 'Why.' },
            })}
            queue={{ runs: [] }}
            variant="compact"
            openHref="/console/p/cb-1/needs-you"
          />
        </MemoryRouter>
      )
    );
    const article = container.querySelector('article[data-ask]');
    if (article === null) throw new Error('No card');
    for (const text of [question, label])
      for (const el of holding(article, text)) expect(wrapsAnywhere(el, article)).toBe(true);
    expect(article.classList.contains('min-w-0')).toBe(true);
    // The tile is not a control and nothing is chosen: green, never the accent.
    const tile = holding(article, label)[0]?.parentElement;
    expect(tile?.classList.contains('border-success/40')).toBe(true);
    expect(tile?.className).not.toContain('accent');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
