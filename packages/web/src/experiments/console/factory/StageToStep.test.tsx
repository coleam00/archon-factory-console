import { afterAll, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FactoryViews, FactoryWorkflow } from '../skills/factory';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { StagePage } from './StagePage';
import { StepPage } from './StepPage';
import deliverJson from './lib/fixtures/deliver-workflow.json';

// Clicking a step is the only way onto a step page, and static markup cannot click.
const dom = new Window({ url: 'http://localhost' });
// The frame keeps the Needs-you count live over SSE; nothing streams in this test.
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

afterAll(async () => {
  globalThis.fetch = originalFetch;
  invalidate('factory-views');
  invalidate('factory-workflow');
  invalidate('runs');
  await dom.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const ID = 'cb-1';
const deliver = deliverJson as FactoryWorkflow;
const views: FactoryViews = {
  views: [
    {
      pack: 'acme/kit',
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-view.json',
      declaration: {
        version: 1,
        pack: 'acme/kit',
        title: 'Kit factory',
        summary: 'Issues come in; changes go out.',
        stages: [
          {
            id: 'checks',
            label: 'Checks',
            blurb: 'Checks the change.',
            group: 'check',
            workflows: ['deliver'],
            nodes: ['rounds.review__review'],
          },
        ],
        placement: {},
        endings: {},
        landed: { stage: 'checks' },
        map: { cards: [], arrows: [] },
      },
    },
  ],
  errors: [],
};

test('clicking a step on the stage graph opens its step page, which leads back to the stage', async () => {
  // The pages read through the cache; a revalidation gets the same answers.
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/factory/views')) return Response.json(views);
      if (url.includes('/api/factory/workflow')) return Response.json(deliver);
      if (url.includes('/api/runs/attention'))
        return Response.json({ items: [], runs: [], degraded: [] });
      return Response.json({ error: 'not in this test' }, { status: 404 });
    },
    { preconnect: originalFetch.preconnect }
  );
  set(K.factoryViews(ID), views);
  set(K.factoryWorkflow(ID, 'deliver'), deliver);

  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        <MemoryRouter initialEntries={[`/console/p/${ID}/factory/stages/checks`]}>
          <Routes>
            <Route path="/console/p/:projectId/factory/stages/:stage" element={<StagePage />} />
            <Route
              path="/console/p/:projectId/factory/steps/:workflow/:node"
              element={<StepPage />}
            />
          </Routes>
        </MemoryRouter>
      )
    );
    const fix = [...container.querySelectorAll('button')].find(button =>
      button.textContent.startsWith('·fix')
    );
    if (!fix) throw new Error('The stage graph drew no fix step');
    await act(async () => {
      fix.click();
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(container.textContent).toContain('deliver · rounds.fix');
    expect(container.textContent).toContain('Back to Checks');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
