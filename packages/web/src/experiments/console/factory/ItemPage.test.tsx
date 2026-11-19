import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryItemDetail, FactoryViews } from '../skills/factory';
import type { AttentionQueue } from '../skills/runs';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { projectRoutes } from '../routes/project-routes';
import { itemDetail, PROJECT, shippedListed, shippedView } from './item-detail.test-fixtures';
import { PILL_CLASS } from './BoardCard';
import { itemPill } from './lib/board';
import { askItem } from '../lib/needs-you.test-fixtures';
import { WORK_ORDER_WORDS } from './ItemWorkOrder';
import { formatDateTime } from '../lib/format';

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
  set(K.projectAttention(PROJECT), attention);
  set(K.factoryItem(PROJECT, key), detail);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/console/p/${PROJECT}/factory/items/${key}`]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
}

/** The header's pill, as the board's card draws it: one class map for both. */
const pill = (state: keyof typeof PILL_CLASS, words: string): string =>
  `${PILL_CLASS[state]}">${words}<`;

/** The page's visible words, tags dropped. */
const text = (html: string): string => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

/** Text as React escapes it inside an attribute value. */
const attribute = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

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
        new RegExp(
          `href="/console/p/${PROJECT}/r/${run.id}"[^>]*><span class="text-console-15 font-semibold`
        )
      );
    // Each deliver run that asked reads "asked you", with the question it left on hover.
    const asks = itemDetail('3').item.answers.filter(answer => answer.kind === 'ask');
    expect(asks).toHaveLength(2);
    for (const ask of asks)
      expect(html).toContain(`title="${attribute(ask.question)}">asked you</span>`);
  });

  test('item 6 runs: its live step, the Running pill, a cost not recorded yet', () => {
    const html = render(itemDetail('6'));
    const words = text(html);
    expect(html).toContain(pill('running', 'Running'));
    expect(words).toContain('deliver · Writes the change');
    expect(html).toContain('title="build__build"');
    expect(words).toContain('No change yet');
    // Where the plan sent it, in the declaration's words; its duration runs to now, with its
    // units; its cost shows as a dash until the run records one.
    expect(words).toMatch(
      /deliver · Writes the change running \d+ (s|min|h|d)( \d+ (min|h))? · - After Plan: sent to Build/
    );
  });

  test('the timeline: a dot per run in its group colour, an icon per outcome, a chip per check', () => {
    const html = render(itemDetail('1'));
    // Triage and Plan are intake, deliver build; then the merged entry in the merged colour.
    const dots = [...html.matchAll(/data-timeline-dot="true"[^>]*background-color:([^"]+)"/g)];
    expect(dots.map(match => match[1])).toEqual([
      'var(--tone-intake)',
      'var(--tone-intake)',
      'var(--node-wait)',
      'var(--success)',
    ]);
    expect([...html.matchAll(/data-kind="([a-z-]+)"/g)].map(match => match[1])).toEqual([
      'sent-on',
      'sent-on',
      'sent-on',
      'merged',
    ]);
    // In local time, so the expectation is too: the fixture merged at 00:03 UTC.
    expect(text(html)).toContain(`Merged ${formatDateTime('2026-11-17T00:03:14Z')}`);
    // Each check a chip in its verdict's soft colours, the engine id on hover only.
    expect(html).toContain('bg-[color:var(--error-soft)] text-error">');
    expect(html).toContain('bg-[color:var(--success-soft)] text-success">');
    expect(html).toMatch(/data-verdict="returned" title="rounds\./);
    // Duration and cost right-aligned in mono.
    expect(html).toMatch(/data-figures="true" class="[^"]*text-right font-mono[^"]*tabular-nums/);
    // The trigger's id is the hover, never the words.
    expect(text(html)).not.toContain('fc-start-triage');
    expect(html).toContain('title="fc-start-triage"');
    // Nothing on the item's own part of the page under the type floor (the project header
    // above it is console chrome).
    const page = html.slice(html.indexOf('data-back-link'));
    expect(page).not.toMatch(/text-console-(9|10|11)\b|\btext-(xs|sm|base|lg)\b/);
  });

  test('the header: the PR as a button-style link, its merge state as a chip', () => {
    const merged = render(itemDetail('1'));
    expect(merged).toMatch(
      /class="inline-flex[^"]*rounded-md border border-border[^"]*"><svg[^>]*lucide-git-pull-request/
    );
    expect(merged).toContain(
      `data-merge-state="true" class="${'whitespace-nowrap rounded-full px-2 py-0.5 text-console-12 font-medium'} ${PILL_CLASS.landed}">merged<`
    );
    expect(render(itemDetail('3'))).toContain('data-merge-state="unknown"');
    const detail = itemDetail('3');
    const change = detail.item.progress?.change;
    if (change === undefined || change === null) throw new Error('item 3 has a change');
    const withMerged = (value: typeof change.merged): FactoryItemDetail => ({
      ...detail,
      item: {
        ...detail.item,
        progress:
          detail.item.progress === null
            ? null
            : { ...detail.item.progress, change: { ...change, merged: value } },
      },
    });
    expect(render(withMerged(false))).toContain(`${PILL_CLASS.waiting}">open<`);
    const pending = render(withMerged('pending'));
    expect(pending).toContain('data-merge-state="pending"');
    expect(pending).toContain('data-skeleton="line"');
    expect(pending).toContain('<span class="sr-only">checking whether it merged</span>');
  });

  test('while the item is read: the header and three runs as skeletons, never Loading', () => {
    set(K.factoryViews(PROJECT), listing);
    set(K.projectAttention(PROJECT), quiet);
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[`/console/p/${PROJECT}/factory/items/77`]}>
        <Routes>{projectRoutes('/console/')}</Routes>
      </MemoryRouter>
    );
    expect(html).toContain('<span class="sr-only">Loading the item</span>');
    expect(html.match(/data-skeleton="block" class="[^"]*h-16/g)?.length).toBe(3);
    expect(html).not.toContain('Loading…');
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
    // The header pill, not the project's Needs you tab that prints the same words on every page.
    expect(html).toContain(pill('needs-you', 'Needs you'));
    expect(words).toContain('Which base should the change target?');
    expect(words).toContain('From the child run?');
    expect(words).not.toContain('Not this item?');
    // Each as the ask card, always open: its tiles, the recommended one first, answerable.
    expect(html.split('data-ask=')).toHaveLength(3);
    expect(words).toContain('Use dev Recommended Rebases onto dev.');
    expect(html.split('aria-pressed="false"').length - 1).toBe(4);
  });

  test('an open ask on a running item: Needs you, as its board card says', () => {
    const detail = itemDetail('6');
    const ask = askItem({ ref: 'ask:open', item: { ...detail.item.item } });
    const read = { ...detail, item: { ...detail.item, questions: [ask] } };
    expect(itemPill(shippedView, read.item, false).pill).toBe('needs-you');
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

describe('work orders on the item page', () => {
  const act = { at: '2026-11-17T00:00:00.000Z', via: 'cli' as const, by: null, fromRun: null };
  type Item = FactoryItemDetail['item'];
  const partOf = (item: Item, order: string): Item => ({
    ...item,
    links: [
      {
        id: `link-${item.item.key}`,
        kind: 'part_of',
        direction: 'outgoing',
        other: { id: `item-${order}`, projectKey: item.item.projectKey, key: order },
        ...act,
        ended: null,
      },
    ],
  });
  /** The board's items read: `items`, and the members of each order it read. */
  const itemsRead = (items: Item[], members: Record<string, string[]> = {}): void => {
    set(K.factoryItems(PROJECT), { items, members });
  };

  test('a member its order run placed, with no link: Part of the order it named', () => {
    const detail = itemDetail('3');
    const item = { ...detail.item, progress: { ...detail.item.progress!, partOf: '48' } };
    itemsRead([item]);
    const html = render({ ...detail, item });
    expect(text(html)).toContain('Part of 48 as its order run recorded');
    expect(html).toContain(`href="/console/p/${PROJECT}/factory/items/48"`);
    expect(text(html)).not.toContain('No links to other items.');
  });

  test('an order with runs of its own: its members, with their state, and how many merged', () => {
    const base = itemDetail('1');
    // 3's link stands as the member; 9's, whose newer link names another order, stays a link.
    const incoming = (key: string) => ({
      id: `link-${key}`,
      kind: 'part_of' as const,
      direction: 'incoming' as const,
      other: { id: `item-${key}`, projectKey: base.item.item.projectKey, key },
      ...act,
      ended: null,
    });
    const order = { ...base, item: { ...base.item, links: [incoming('3'), incoming('9')] } };
    itemsRead([order.item, partOf(itemDetail('3').item, '1')], { '1': ['3'] });
    const words = text(render(order));
    expect(words).toContain('Members: 0 of 1 merged');
    expect(words).toContain('Has part 9');
    expect(words).not.toContain('Has part 3');
    expect(words).toMatch(/3 [^<]*Waiting Build/);
    // Its own column and state still show: it is worked by the factory.
    expect(words).not.toContain(WORK_ORDER_WORDS);
  });

  test('an order with no run of its own: no column or state, its members', () => {
    const base = itemDetail('1');
    const detail: FactoryItemDetail = {
      ...base,
      runs: [],
      item: {
        ...base.item,
        item: { ...base.item.item, id: 'item-48', key: '48' },
        runs: [],
        questions: [],
        answers: [],
        progress: { ...base.item.progress!, title: null, round: null, change: null, runs: [] },
      },
    };
    itemsRead([partOf(itemDetail('3').item, '48')], { '48': ['3'] });
    const html = render(detail);
    const words = text(html);
    expect(words).toContain(WORK_ORDER_WORDS);
    const header = /<header class="flex flex-col gap-2">.*?<\/header>/.exec(html)?.[0] ?? '';
    expect(text(header)).toBe(` 48 Work order 48 ${WORK_ORDER_WORDS} `);
    expect(words).toContain('Members: 0 of 1 merged');
  });

  test('a member with no run yet: Not started, no state, column or change', () => {
    const base = itemDetail('1');
    const detail: FactoryItemDetail = {
      ...base,
      runs: [],
      item: {
        ...partOf({ ...base.item, item: { ...base.item.item, id: 'item-58', key: '58' } }, '48'),
        runs: [],
        questions: [],
        answers: [],
        progress: { ...base.item.progress!, title: null, round: null, change: null, runs: [] },
      },
    };
    itemsRead([]);
    const html = render(detail);
    const header = /<header class="flex flex-col gap-2">.*?<\/header>/.exec(html)?.[0] ?? '';
    expect(text(header)).toBe(' 58 58 Not started ');
    expect(text(html)).toContain('Part of 48');
  });

  test('an order whose members have not started: its members from its own links, N of M merged', () => {
    const base = itemDetail('1');
    const incoming = (key: string) => ({
      id: `link-${key}`,
      kind: 'part_of' as const,
      direction: 'incoming' as const,
      other: { id: `item-${key}`, projectKey: base.item.item.projectKey, key },
      ...act,
      ended: null,
    });
    const detail: FactoryItemDetail = {
      ...base,
      runs: [],
      item: {
        ...base.item,
        item: { ...base.item.item, id: 'item-48', key: '48' },
        runs: [],
        questions: [],
        answers: [],
        progress: { ...base.item.progress!, title: null, round: null, change: null, runs: [] },
        links: [incoming('9'), incoming('10'), { ...incoming('11'), ended: act }],
      },
    };
    // No item on the board names 48, so the items read never asked about it.
    itemsRead([itemDetail('3').item], {});
    const words = text(render(detail));
    expect(words).toContain(WORK_ORDER_WORDS);
    expect(words).toContain('Members: 0 of 2 merged');
    expect(words.match(/Not started/g)).toHaveLength(2);
    // The live links stand as the members; an ended one is no member and stays a raw link.
    expect(words).not.toContain('Has part 9');
    expect(words).toContain('Has part 11 ended');
  });

  test('an order with no run of its own says so from its own links, before the items read', () => {
    const base = itemDetail('1');
    const detail: FactoryItemDetail = {
      ...base,
      runs: [],
      item: {
        ...base.item,
        item: { ...base.item.item, id: 'item-48', key: '48' },
        runs: [],
        progress: { ...base.item.progress!, title: null, round: null, change: null, runs: [] },
        links: [
          {
            id: 'link-3',
            kind: 'part_of',
            direction: 'incoming',
            other: { id: 'item-3', projectKey: base.item.item.projectKey, key: '3' },
            ...act,
            ended: null,
          },
        ],
      },
    };
    const words = text(render(detail));
    expect(words).toContain(WORK_ORDER_WORDS);
    expect(words).not.toContain('In Order');
  });
});
