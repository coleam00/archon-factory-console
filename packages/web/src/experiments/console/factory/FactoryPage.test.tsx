import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryPacksRead, FactoryViews } from './api';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { FK } from './keys';
import { factoryRoutes } from './routes';
import type { FactoryItem } from './api';
import { FIXTURE_NOW, needsShaping, PAGE, realItem, VIEW } from './lib/board.test-fixtures';
import { shippedListed } from './item-detail.test-fixtures';
import { attentionRead, refAsk } from './lib/attention.test-fixtures';
import type { RunsAttention } from '../primitives/run';

// The board sets aside items idle past a line counted from now, so the fixtures' items are read
// at the time they were copied, never at the day the test runs.
beforeAll(() => {
  setSystemTime(FIXTURE_NOW);
});
afterAll(() => {
  setSystemTime();
});

const ID = 'cb-1';

afterEach(() => {
  invalidate('factory-views');
  invalidate('project');
  invalidate('runs');
  invalidate('runs:factory-items');
});

const quiet = attentionRead();

const withView: FactoryViews = {
  views: [
    {
      pack: 'acme/kit',
      packKey: 'acme.kit',
      runNames: { deliver: 'acme/kit:deliver' },
      source: 'project-file',
      path: '/repo/.archon/packs/acme.kit.factory-view.json',
      declaration: {
        version: 1,
        pack: 'acme/kit',
        title: 'Kit factory',
        summary: 'Issues come in; changes go out.',
        stages: [
          {
            id: 'build',
            label: 'Build',
            blurb: 'Builds.',
            group: 'build',
            workflows: ['deliver'],
          },
          {
            id: 'checks',
            label: 'Checks',
            blurb: 'Checks the change.',
            group: 'check',
            workflows: ['deliver'],
          },
          { id: 'landed', label: 'Landed', blurb: 'Merged.', group: 'land', workflows: [] },
        ],
        placement: {},
        endings: {},
        landed: { stage: 'build' },
        map: { cards: [], arrows: [] },
      },
    },
  ],
  errors: [],
};
const none: FactoryViews = { views: [], errors: [] };
/** The declaration this repository ships, over the real items the board's fixtures hold. */
const shipped: FactoryViews = {
  views: [
    {
      ...shippedListed,
      declaration: VIEW,
    },
  ],
  errors: [],
};

/**
 * Every link marked as the current page, as `href label`, whatever its other attributes:
 * the project tab and the sub-navigation entry. Styling is not what is asserted.
 */
const currentLinks = (html: string): string[] =>
  [...html.matchAll(/<a\s([^>]*)>(.*?)<\/a>/g)]
    .filter(([, attributes]) => / aria-current="page"|^aria-current="page"/.test(attributes ?? ''))
    .map(([, attributes, body]) => {
      const href = /href="([^"]*)"/.exec(attributes ?? '')?.[1] ?? '';
      return `${href} ${(body ?? '').replace(/<[^>]*>/g, '')}`;
    });

function render(
  path: string,
  listing: FactoryViews,
  attention: RunsAttention = quiet,
  items: FactoryItem[] = []
): string {
  set(FK.factoryViews(ID), listing);
  // The project tabs show Factory for a project a pack lists.
  set(FK.factoryPacks, {
    packs: [{ projects: [{ codebaseId: ID, name: 'acme' }] }],
  } as unknown as FactoryPacksRead);
  set(K.runsAttention, attention);
  set(FK.factoryItems(ID), { items, members: {} });
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>{factoryRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
}

/** Six open asks, newest last, on six of the board's real items: more than the Overview shows. */
const askedKeys = ['1', '2', '3', '4', '5', '6'];
const askedItems = askedKeys.map(realItem);
const sixAsks = attentionRead(
  askedItems.map(({ item }, i) =>
    refAsk({
      ref: `ask:${i.toString()}`,
      item: { ...item },
      message: `Question ${i.toString()}?`,
      pausedAt: `2026-11-1${i.toString()}T09:00:00.000Z`,
    })
  )
);
/** An item waiting on you with no ask open, its own item and not item 6 it is made from. */
const shaping = needsShaping('9s', ['Which?']);
const awaitingOnly: FactoryItem = { ...shaping, item: { ...shaping.item, id: 'item-9s' } };
/** The Overview's Needs you section, as markup. */
const needsYouOf = (html: string): string => {
  const start = html.indexOf('aria-label="Needs you"');
  return start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
};
/** The items the Overview's Needs you rows open, by key, in order. */
const rowKeys = (html: string): string[] =>
  [...needsYouOf(html).matchAll(/data-ask-trigger="([^"]*)"/g)].map(([, key]) => key ?? '');
const text = (html: string): string => html.replace(/<[^>]*>/g, '');
/** The Overview's link to the board's needs-you show, as markup. */
const moreLink = (html: string): string =>
  /<a[^>]*href="[^"]*\/factory\/board\?show=needs-you"[^>]*>.*?<\/a>/.exec(html)?.[0] ?? '';
const SUMMARY = 'Issues come in; changes go out.';
/** The Factory sub-navigation's links, as `href label`. */
const subNav = (html: string): string[] => {
  const start = html.indexOf('aria-label="Factory"');
  expect(start).toBeGreaterThan(-1);
  return [
    ...html
      .slice(start, html.indexOf('</nav>', start))
      .matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g),
  ].map(([, href, body]) => `${href ?? ''} ${text(body ?? '')}`);
};
const SUB_NAV = [`/console/p/${ID}/factory Overview`, `/console/p/${ID}/factory/board Board`];

describe('the Factory section', () => {
  test('a busy Overview: the title, one count of what waits, the newest three asks as rows, then the map', () => {
    const html = render(`/console/p/${ID}/factory`, shipped, sixAsks, [
      ...askedItems,
      awaitingOnly,
    ]);
    expect(html).toContain(VIEW.title);
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory Overview`,
    ]);
    expect(subNav(html)).toEqual(SUB_NAV);
    // Six asks and an item waiting on you.
    const strip = html.slice(html.indexOf('aria-label="Numbers"'), html.indexOf('</ul>'));
    expect(text(strip)).toContain('need you7');
    // The newest three, one row each, and none of Archon's ask section drawn in the page.
    expect(rowKeys(html)).toEqual(['6', '5', '4']);
    for (const i of [5, 4, 3]) expect(needsYouOf(html)).toContain(`Question ${i.toString()}?`);
    expect(html).not.toContain('data-ask-ref=');
    // The rest wait on the board: three asks and the item waiting on you.
    expect(text(moreLink(html))).toContain('4');
    const needsYou = html.indexOf('aria-label="Needs you"');
    expect(needsYou).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="The map"')).toBeGreaterThan(needsYou);
  });

  test('a quiet Overview says an item waits on you, and its numbers count the board', () => {
    const waiting = render(`/console/p/${ID}/factory`, withView, quiet, [
      needsShaping('9s', ['Which?']),
    ]);
    expect(waiting).toContain('Kit factory');
    expect(waiting).toContain(SUMMARY);
    expect(text(moreLink(waiting))).toContain('1');
    expect(rowKeys(waiting)).toEqual([]);

    const html = render(`/console/p/${ID}/factory`, shipped, quiet, PAGE.items);
    const strip = text(
      html.slice(html.indexOf('aria-label="Numbers"'), html.indexOf('aria-label="The map"'))
    );
    // Item 3's merge state is unknown: counted only in M.
    for (const tile of ['in flight4', 'need you0', 'merged3 of 8', 'median to merged'])
      expect(strip).toContain(tile);
  });

  test('the board sits under Board, its columns the declared stages, the title without the summary', () => {
    const html = render(`/console/p/${ID}/factory/board`, withView, sixAsks);
    expect(currentLinks(html)).toEqual([
      `/console/p/${ID}/factory Factory`,
      `/console/p/${ID}/factory/board Board`,
    ]);
    expect(subNav(html)).toEqual(SUB_NAV);
    expect(html).toContain('aria-label="Build"');
    expect(html).toContain('Kit factory');
    expect(html).not.toContain(SUMMARY);
  });

  test('a broken project file shows its path and error; a project no view applies to, an empty state', () => {
    const broken = render(`/console/p/${ID}/factory`, {
      views: [],
      errors: [
        { pack: 'acme.kit', source: 'project-file', path: '/repo/x.json', error: 'is invalid' },
      ],
    });
    expect(broken).toContain('/repo/x.json');
    expect(broken).toContain('is invalid');
    expect(broken).not.toContain('No factory view applies');
    expect(render(`/console/p/${ID}/factory`, none)).toContain(
      'No factory view applies to this project'
    );
  });
});
