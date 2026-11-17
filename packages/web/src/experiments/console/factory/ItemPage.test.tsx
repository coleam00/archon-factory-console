import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FactoryItemDetail, FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { itemDetail, PROJECT, shippedListed, shippedView } from './item-detail.test-fixtures';
import { PILL_CLASS } from './BoardCard';
import { ItemPage } from './ItemPage';
import { itemPill } from './lib/board';
import { askItem } from './needs-you.test-fixtures';

afterEach(() => {
  invalidate('factory-views');
  invalidate('factory-items');
  invalidate('project');
  invalidate('runs');
});

const listing: FactoryViews = {
  views: [shippedListed],
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

/** The header's pill, as the board's card draws it: one class map for both. */
const pill = (state: keyof typeof PILL_CLASS, words: string): string =>
  `${PILL_CLASS[state]}">${words}<`;

/** The page's visible words, tags dropped. */
const text = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

describe('the item page', () => {
  test('item 3: header, its two deliver runs, and the asks it was answered', () => {
    const html = render(itemDetail('3'));
    const words = text(html);
    expect(html).toContain(pill('waiting', 'Waiting'));
    // The title alone: the summary is the Overview's.
    expect(words).toContain(shippedView.title);
    expect(html).not.toContain(shippedView.summary);
    expect(words).toContain('In Build');
    expect(words).toContain('PR #14');
    expect(words).toContain('merge state unknown');
    expect(words.match(/Build deliver/g)?.length).toBe(2);
    expect(words).toContain('round 2 of 3 · needs a decision');
    expect(words).toContain('Ask answered');
    expect(words).toContain('1 answered, 0 withdrawn');
    expect(words).toContain('Nothing on this item is waiting on you.');
    expect(words).toContain('No links to other items.');
    // Each timeline row's own link: started-by and answer links carry the same hrefs.
    for (const run of itemDetail('3').item.runs)
      expect(html).toMatch(
        new RegExp(`href="/console/p/${PROJECT}/r/${run.id}"[^>]*><span class="font-medium">`)
      );
  });

  test('item 6 runs: its live step, the Running pill, a cost not recorded yet', () => {
    const html = render(itemDetail('6'));
    const words = text(html);
    expect(html).toContain(pill('running', 'Running'));
    expect(words).toContain('deliver · build__build');
    expect(words).toContain('No change yet');
    // Where the plan sent it, in the declaration's words; its duration runs to now, with its
    // units; its cost shows as a dash until the run records one.
    expect(words).toMatch(/After Plan: sent to Build \d+ (s|min|h|d)( \d+ (min|h))? - /);
  });

  test("lists only this item's asks from the live queue, answerable, and says it needs you", () => {
    // Item 3: its change has not merged, so an open ask is what its pill says.
    const detail = itemDetail('3');
    const mine = askItem({ ref: 'ask:mine', item: { ...detail.item.item } });
    // A wait in a child run names no item; the item read lists it among its questions.
    const child = askItem({ ref: 'ask:child', item: undefined, message: 'From the child run?' });
    const other = askItem({ ref: 'ask:other', message: 'Not this item?' });
    const read = { ...detail, item: { ...detail.item, questions: [child] } };
    const html = render(read, { items: [mine, child, other], runs: [], degraded: [] });
    const words = text(html);
    // The header pill, not the sub-navigation entry that prints the same words on every page.
    expect(html).toContain(pill('needs-you', 'Needs you'));
    expect(words).toContain('Which base should the change target?');
    expect(words).toContain('From the child run?');
    expect(words).not.toContain('Not this item?');
    expect(words).toContain('Recommended: Use dev');
  });

  test('an open ask on a running item: Needs you, as its board card says', () => {
    const detail = itemDetail('6');
    const ask = askItem({ ref: 'ask:open', item: { ...detail.item.item } });
    const read = { ...detail, item: { ...detail.item, questions: [ask] } };
    expect(itemPill(read.item, false).pill).toBe('needs-you');
    const html = render(read, { items: [ask], runs: [], degraded: [] });
    expect(html).toContain(pill('needs-you', 'Needs you'));
    expect(html).not.toContain(pill('running', 'Running'));
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
