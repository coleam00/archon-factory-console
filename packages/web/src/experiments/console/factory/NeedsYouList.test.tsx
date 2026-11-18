import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { AttentionQueue } from '../skills/runs';
import { get, invalidate, set, type EntityView } from '../store/cache';
import { toRun } from '../primitives/run';
import { K } from '../store/keys';
import type { NeedsYouItem } from './lib/needs-you';
import { NeedsYouLine } from './NeedsYouLine';
import { NeedsYouList } from './NeedsYouList';
import { answerByRef } from './NeedsYouRow';
import { askItem, gateItem, unreadableItem, usageLimitItem } from './needs-you.test-fixtures';
import { shippedView } from './item-detail.test-fixtures';
import { run, settledItem } from './lib/map.test-fixtures';

const ID = 'cb-1';
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { window?: unknown }).window = originalWindow;
  invalidate('runs');
  invalidate('factory-items');
});

const newest = askItem({ ref: 'ask:new', pausedAt: '2026-11-16T09:00:00.000Z' });
const older = askItem({
  ref: 'ask:old',
  item: { id: 'item-3', projectKey: 'acme', key: '#3' },
  pausedAt: '2026-11-15T09:00:00.000Z',
  message: 'Ship it behind a flag?',
  context: undefined,
  recommendation: undefined,
  options: [{ id: 'yes' }, { id: 'no' }],
});
const gate = gateItem({ ref: 'gate:1', message: 'Approve the plan?' });
const queue: AttentionQueue = {
  items: [gate, older, usageLimitItem(), newest],
  runs: [],
  degraded: [],
};

const loaded = (data: AttentionQueue): EntityView<AttentionQueue> => ({
  data,
  error: undefined,
  loading: false,
  refetch: () => {},
});

function render(attention: EntityView<AttentionQueue>): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <NeedsYouList projectId={ID} view={shippedView} attention={attention} />
    </MemoryRouter>
  );
}

/** One line, opened: what the Overview shows after the operator clicks Open. */
function renderOpened(item: NeedsYouItem, data: AttentionQueue): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <NeedsYouLine projectId={ID} item={item} queue={data} open onToggle={() => {}} />
    </MemoryRouter>
  );
}

function captureFetch(status: number, body: unknown): { path: string; body: unknown }[] {
  const requests: { path: string; body: unknown }[] = [];
  // requestJson reads the page origin when it reports a failure.
  (globalThis as { window?: unknown }).window = { location: { origin: 'http://localhost' } };
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        path:
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        body: JSON.parse(String(init?.body)),
      });
      return Response.json(body, { status });
    },
    { preconnect: originalFetch.preconnect }
  );
  return requests;
}

describe('the Needs-you list', () => {
  test('lists every open ask and wait newest first, untimed gates last, usage limits left out', () => {
    const html = render(loaded(queue));
    const at = (text: string): number => {
      const index = html.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(html).toContain('Needs you · 3');
    expect(at('Which base should the change target?')).toBeLessThan(at('Ship it behind a flag?'));
    expect(at('Ship it behind a flag?')).toBeLessThan(at('Approve the plan?'));
    expect(html).not.toContain('run-limit');
    expect(html).toContain(`href="/console/p/${ID}/factory/items/%237"`);
    expect(html).toContain('>#7</a>');
    // Each line says what answering takes; the forms wait until a line is opened.
    expect(html).toContain('Recommended: Use dev');
    expect(html).toContain('2 options');
    expect(html).toContain('Approve or reject');
    expect(html).not.toContain('Dev is the working base.');
    expect(html.split('aria-expanded="false"')).toHaveLength(4);
  });

  test('a line names the rest of the kinds in plain words', () => {
    const html = render(
      loaded({
        items: [
          askItem({ ref: 'ask:words', form: 'message', options: [], recommendation: undefined }),
          unreadableItem({ ref: 'run-unreadable:1' }),
        ],
        runs: [],
        degraded: [],
      })
    );
    expect(html).toContain('Answer in words');
    expect(html).toContain('Could not be read');
  });

  test('past four asks it shows the newest four and says how many more, the heading the total', () => {
    const six = Array.from({ length: 6 }, (_, i) =>
      askItem({
        ref: `ask:${i.toString()}`,
        message: `Question ${i.toString()}?`,
        pausedAt: `2026-11-1${i.toString()}T09:00:00.000Z`,
      })
    );
    const html = render(loaded({ items: six, runs: [], degraded: [] }));
    expect(html).toContain('Needs you · 6');
    expect(html.split('aria-expanded="false"')).toHaveLength(5);
    for (const shown of ['Question 5?', 'Question 4?', 'Question 3?', 'Question 2?'])
      expect(html).toContain(shown);
    expect(html).not.toContain('Question 1?');
    expect(html).toContain('2 more · show all 6');

    const four = render(loaded({ items: six.slice(0, 4), runs: [], degraded: [] }));
    expect(four).not.toContain('show all');
  });

  test('a gate whose run row is missing, opened, leads to the run instead of answering blind', () => {
    expect(renderOpened(gate, queue)).toContain('Answer it on the run');
  });

  test('an opened line shows the context, then the recommendation with why, then the others with does and cost', () => {
    const html = renderOpened(newest, queue);
    // The question once: the opened line drops its one-line summary.
    expect(html.split('Which base should the change target?')).toHaveLength(2);
    const at = (text: string): number => {
      const index = html.indexOf(text);
      expect(index).toBeGreaterThanOrEqual(0);
      return index;
    };
    expect(at('Which base should the change target?')).toBeLessThan(
      at('The branch was cut from main but the item names dev.')
    );
    expect(at('The branch was cut from main')).toBeLessThan(at('Recommended: Use dev'));
    expect(at('Recommended: Use dev')).toBeLessThan(at('Dev is the working base.'));
    expect(at('Dev is the working base.')).toBeLessThan(at('Cost: One more rebase.'));
    expect(at('Cost: One more rebase.')).toBeLessThan(at('Rebases onto main.'));
    expect(at('Rebases onto main.')).toBeLessThan(at('Cost: Drops dev fixes.'));
  });

  test("an opened gate whose run row is present is answered with the run's approval controls, its question once", () => {
    const run = toRun({
      id: 'run-gate',
      workflow_name: 'deliver',
      codebase_id: ID,
      status: 'paused',
      started_at: '2026-11-16T08:00:00Z',
      metadata: {
        approval: { nodeId: 'review-gate', pauseId: 'pause-1', message: 'Approve the plan?' },
      },
    });
    const html = renderOpened(gate, { items: [gate], runs: [run], degraded: [] });
    expect(html.split('Approve the plan?')).toHaveLength(2);
    expect(html).toContain('Continue');
    expect(html).not.toContain('Answer it on the run');
  });

  test('says plainly when nothing waits, and when a paused run could not be read', () => {
    expect(render(loaded({ items: [], runs: [], degraded: [] }))).toContain(
      'Nothing is waiting on a person.'
    );
    expect(
      render(
        loaded({
          items: [],
          runs: [],
          degraded: [{ type: 'degraded', reason: 'run_unreadable', runId: 'r' }],
        })
      )
    ).toContain('One paused run could not be read');
  });
});

describe('answered lately', () => {
  test('each settled set says the stage it started again, linking to that run, or that none has', () => {
    set(K.factoryItems(ID), {
      items: [
        settledItem(
          'p',
          run('plan', 'completed', 'ask'),
          '2026-11-17T10:00:00.000Z',
          run('plan', 'running', null, 'plan')
        ),
        settledItem('w', run('deliver', 'completed', 'ask'), '2026-11-17T09:00:00.000Z'),
      ],
      members: {},
    });
    const html = render(loaded({ items: [], runs: [], degraded: [] }));
    expect(html).toContain('Answered lately');
    expect(html).toContain('2 answered, 1 withdrawn');
    expect(html).toContain(`href="/console/p/${ID}/r/run-p-1"`);
    expect(html).toContain('Plan started again (running)');
    expect(html).toContain('no run started from these answers');
    // Newest first.
    expect(html.indexOf('#p')).toBeLessThan(html.indexOf('#w'));
  });

  test('nothing settled: no list', () => {
    set(K.factoryItems(ID), { items: [], members: {} });
    expect(render(loaded({ items: [], runs: [], degraded: [] }))).not.toContain('Answered lately');
  });
});

describe('answering in place', () => {
  test('posts the answer by ref, refreshes the queue, and the answered ask leaves the list', async () => {
    set(K.factoryAttention(ID), queue);
    const requests = captureFetch(200, { ref: 'ask:new', action: 'answer', unchanged: false });

    await answerByRef('ask:new')(['use-dev'], undefined);

    expect(requests).toEqual([
      { path: '/api/attention/answer', body: { ref: 'ask:new', choose: ['use-dev'] } },
    ]);
    // No subscriber holds the key here, so invalidating it drops the cached queue.
    expect(get(K.factoryAttention(ID))).toBeUndefined();

    const after = render(loaded({ ...queue, items: queue.items.filter(i => i.ref !== 'ask:new') }));
    expect(after).not.toContain('Which base should the change target?');
    expect(after).toContain('Ship it behind a flag?');
  });
});
