import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { AttentionQueue } from '../skills/runs';
import { get, invalidate, set, type EntityView } from '../store/cache';
import { toRun } from '../primitives/run';
import { K } from '../store/keys';
import { answerByRef, NeedsYouList } from './NeedsYouList';
import { askItem, gateItem, usageLimitItem } from './needs-you.test-fixtures';

const ID = 'cb-1';
const originalFetch = globalThis.fetch;
const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as { window?: unknown }).window = originalWindow;
  invalidate('runs');
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
      <NeedsYouList projectId={ID} attention={attention} />
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
    // A gate whose run row is missing leads to the run instead of answering blind.
    expect(html).toContain('Answer it on the run');
  });

  test('a row shows the context, then the recommendation with why, then the others with does and cost', () => {
    const html = render(loaded({ ...queue, items: [newest] }));
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

  test("a gate whose run row is present is answered with the run's approval controls, its question once", () => {
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
    const html = render(loaded({ items: [gate], runs: [run], degraded: [] }));
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
