import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FactoryItemDetail, FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { itemDetail, PROJECT, shippedView } from './item-detail.test-fixtures';
import { ItemPage } from './ItemPage';
import { askItem } from './needs-you.test-fixtures';

afterEach(() => {
  invalidate('factory-views');
  invalidate('factory-items');
  invalidate('project');
  invalidate('runs');
});

const listing: FactoryViews = {
  views: [
    {
      pack: 'Wirasm/archon-software-factory',
      source: 'project-file',
      path: '/repo/.archon/packs/Wirasm.archon-software-factory.factory-view.json',
      declaration: shippedView,
    },
  ],
  errors: [],
};
const quiet: AttentionQueue = { items: [], runs: [], degraded: [] };

function render(detail: FactoryItemDetail, attention: AttentionQueue = quiet): string {
  const key = detail.item.item.key;
  set(K.factoryViews(PROJECT), listing);
  set(K.factoryAttention(PROJECT), attention);
  set(K.factoryItem(PROJECT, key), detail);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/console/p/${PROJECT}/factory/items/${key}`]}>
      <Routes>
        <Route path="/console/p/:projectId/factory/items/:key" element={<ItemPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** The page's visible words, tags dropped. */
const text = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('the item page', () => {
  test('item 3: header, its two deliver runs, and the asks it was answered', () => {
    const html = render(itemDetail('3'));
    const words = text(html);
    expect(words).toContain('Waiting');
    expect(words).toContain('In Build');
    expect(words).toContain('PR #14');
    expect(words).toContain('merge state unknown');
    expect(words.match(/Build deliver/g)?.length).toBe(2);
    expect(words).toContain('round 2 of 3 · ask');
    expect(words).toContain('Ask answered');
    expect(words).toContain('1 answered, 0 withdrawn');
    expect(words).toContain('Nothing on this item is waiting on you.');
    expect(words).toContain('No links to other items.');
    for (const run of itemDetail('3').item.runs)
      expect(html).toContain(`href="/console/p/${PROJECT}/r/${run.id}"`);
  });

  test('item 6 runs: its live step, the Running pill, a cost not recorded yet', () => {
    const words = text(render(itemDetail('6')));
    expect(words).toContain('Running');
    expect(words).toContain('deliver · build__build');
    expect(words).toContain('No change yet');
    // Its duration runs to now; its cost shows as a dash until the run records one.
    expect(words).toMatch(/After Plan: planned \S+ - /);
  });

  test("lists only this item's asks from the live queue, answerable, and says it needs you", () => {
    const detail = itemDetail('1');
    const mine = askItem({ ref: 'ask:mine', item: { ...detail.item.item } });
    // A wait in a child run names no item; the item read lists it among its questions.
    const child = askItem({ ref: 'ask:child', item: undefined, message: 'From the child run?' });
    const other = askItem({ ref: 'ask:other', message: 'Not this item?' });
    const read = { ...detail, item: { ...detail.item, questions: [child] } };
    const html = render(read, { items: [mine, child, other], runs: [], degraded: [] });
    const words = text(html);
    expect(words).toContain('Needs you');
    expect(words).toContain('Which base should the change target?');
    expect(words).toContain('From the child run?');
    expect(words).not.toContain('Not this item?');
    expect(words).toContain('Recommended: Use dev');
  });

  test('links in plain words, both directions, an ended one marked', () => {
    const detail = itemDetail('1');
    const act = { at: '2026-11-17T00:00:00.000Z', via: 'cli' as const, by: null, fromRun: null };
    const other = (key: string) => ({ id: `item-${key}`, projectKey: 'p', key });
    const links: FactoryItemDetail['item']['links'] = [
      {
        id: 'l1',
        kind: 'depends_on',
        direction: 'outgoing',
        other: other('4'),
        ...act,
        ended: null,
      },
      { id: 'l2', kind: 'part_of', direction: 'incoming', other: other('9'), ...act, ended: act },
    ];
    const html = render({ ...detail, item: { ...detail.item, links } });
    const words = text(html);
    expect(words).toContain('Depends on 4');
    expect(words).toContain('Has part 9 ended');
    expect(html).toContain(`href="/console/p/${PROJECT}/factory/items/4"`);
  });
});
