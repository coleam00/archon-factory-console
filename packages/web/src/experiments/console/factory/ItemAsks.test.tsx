import { afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import type { FactoryItem } from './api';
import { Board } from './BoardPage';
import { itemDetail, PROJECT, shippedListed } from './item-detail.test-fixtures';
import { FK } from './keys';
import { attentionRead, refAsk } from './lib/attention.test-fixtures';
import { realItem, VIEW } from './lib/board.test-fixtures';
import { DISCOVERIES } from './lib/discoveries.test-fixtures';
import { cancelRereads } from './merge-reread';
import { cancelMergeWatches } from './merge-watch';
import { factoryTestRoutes } from './test-routes';
import { installDom } from './test-dom.test-helpers';

// Opening an ask and answering it happen on events, which static markup cannot reach.
const { mount } = await installDom();
const originalFetch = globalThis.fetch;

/** Every read comes from the cache; only an answer is sent, and recorded. */
function serveAnswers(): { path: string; body: unknown }[] {
  const sent: { path: string; body: unknown }[] = [];
  globalThis.fetch = Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const path = String(input);
      if (path !== '/api/attention/answer') return new Promise<Response>(() => undefined);
      sent.push({ path, body: JSON.parse(String(init?.body)) });
      return Response.json({ success: true });
    },
    { preconnect: originalFetch.preconnect }
  );
  return sent;
}

afterEach(() => {
  cancelRereads();
  cancelMergeWatches();
  invalidate('runs');
  invalidate('factory-views');
});

const project = { key: 'acme', codebaseId: PROJECT, name: 'acme' };
/** An open ask on `item`, which the item read and Archon's attention read both list. */
function askOn(item: Pick<FactoryItem, 'item'>) {
  return refAsk({ project, item: { ...item.item } });
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

const buttonNamed = (root: ParentNode, name: string): HTMLButtonElement | undefined =>
  [...root.querySelectorAll('button')].find(
    button =>
      (button.getAttribute('aria-label') ?? button.textContent ?? '').startsWith(name) ||
      button.textContent === name
  );

/** Archon's ask is shown with its options, recommendation and cost, and answering posts it. */
async function answersThroughArchon(
  root: ParentNode,
  sent: { path: string; body: unknown }[]
): Promise<void> {
  const words = root.textContent ?? '';
  expect(words).toContain('Which base should the change target?');
  expect(words).toContain('Recommended: Use dev');
  expect(words).toContain('Cost: One more rebase.');
  expect(buttonNamed(root, 'Use main')).toBeDefined();
  const recommended = buttonNamed(root, 'Use dev (recommended)');
  if (recommended === undefined) throw new Error('No button for the recommended option');
  await click(recommended);
  expect(sent).toEqual([
    { path: '/api/attention/answer', body: { ref: 'ask:1', choose: ['use-dev'] } },
  ]);
  expect(root.textContent).toContain('Answered: Use dev');
}

describe("an item's open ask", () => {
  test('on the board: the card names the count, and opens Archon’s ask, which answers', async () => {
    const sent = serveAnswers();
    const six = realItem('6');
    const ask = { ...askOn(six), project: { ...project, codebaseId: 'cb-1' } };
    set(FK.factoryItems('cb-1'), { items: [{ ...six, questions: [ask] }], members: {} });
    set(FK.factoryDiscoveries('cb-1'), DISCOVERIES);
    set(K.runsAttention, attentionRead([ask]));
    const board = await mount(
      <MemoryRouter initialEntries={['/console/p/cb-1/factory/board']}>
        <Routes>
          <Route
            path="/console/p/:projectId/factory/board"
            element={<Board projectId="cb-1" view={VIEW} now={new Date(2026, 10, 18, 12)} />}
          />
        </Routes>
      </MemoryRouter>
    );
    try {
      const card = board.container.querySelector('article[data-card="6"]');
      const open = card === null ? undefined : buttonNamed(card, '1 open ask');
      if (open === undefined) throw new Error('The card names no open ask');
      await click(open);
      const dialog = document.body.querySelector('[role="dialog"]');
      if (dialog === null) throw new Error('No ask opened over the board');
      await answersThroughArchon(dialog, sent);
    } finally {
      await board.unmount();
    }
  });

  test('on the item page: Archon’s ask waits on you there, and answers', async () => {
    const sent = serveAnswers();
    const detail = itemDetail('6');
    const ask = askOn(detail.item);
    set(FK.factoryViews(PROJECT), { views: [shippedListed], errors: [] });
    set(FK.factoryItem(PROJECT, '6'), { ...detail, item: { ...detail.item, questions: [ask] } });
    set(FK.factoryItems(PROJECT), { items: [], members: {} });
    set(K.runsAttention, attentionRead([ask]));
    const page = await mount(
      <MemoryRouter initialEntries={[`/console/p/${PROJECT}/factory/items/6`]}>
        <Routes>{factoryTestRoutes()}</Routes>
      </MemoryRouter>
    );
    try {
      const waiting = page.container.querySelector('[aria-labelledby="story-waiting"]');
      if (waiting === null) throw new Error('Nothing waits on you on the item page');
      await answersThroughArchon(waiting, sent);
    } finally {
      await page.unmount();
    }
  });
});
