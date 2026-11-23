/**
 * Items delivered by a workflow the view now declares `retired` (the pack no longer has it)
 * still place, render and count exactly as they did while the pack had it. The pinned file was
 * written from the view as it stood before `deliver` was retired; any change to how an old
 * deliver item reads fails here. `PIN_WRITE=1 bun test retired-deliver` rewrites it, which only
 * a change meant to alter how those items read should do.
 */
import { afterEach, expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes } from 'react-router';
import type { FactoryItemDetail } from '../skills/factory';
import { invalidate, set } from '../store/cache';
import { K } from '../store/keys';
import { projectRoutes } from '../routes/project-routes';
import { itemDetail, PROJECT, shippedListed } from './item-detail.test-fixtures';
import { boardModel, PILL_LABEL, positionOf, type PlacedCard } from './lib/board';
import { delivering, PAGE, VIEW } from './lib/board.test-fixtures';
import { stageLive } from './lib/map-live';

afterEach(() => {
  invalidate('factory-views');
  invalidate('factory-items');
  invalidate('project');
});

const PINNED = join(import.meta.dir, '__fixtures__', 'retired-deliver.pinned.json');

/** Local times masked, so the pin holds in any time zone. */
const masked = (text: string): string =>
  text.replace(
    /[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}(:\d{2})?( [AP]M)?( [A-Z][A-Za-z0-9+:-]*)?/g,
    '<time>'
  );

function itemPage(detail: FactoryItemDetail): string {
  const key = detail.item.item.key;
  set(K.factoryViews(PROJECT), { views: [shippedListed], errors: [] });
  set(K.projectAttention(PROJECT), { items: [], runs: [], degraded: [] });
  set(K.factoryItem(PROJECT, key), detail);
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/console/p/${PROJECT}/factory/items/${key}`]}>
      <Routes>{projectRoutes('/console/')}</Routes>
    </MemoryRouter>
  );
}

/**
 * A card as the pin holds it: `pillLabel` came after the pin, and an old deliver item's is its
 * pill's fixed words, which the test checks apart.
 */
function pinnedCard({ column, card }: PlacedCard): unknown {
  const { pillLabel: _, ...rest } = card;
  return { at: positionOf(column), card: rest };
}

/** Where every item of the real page sits, with the card it shows and the map stage. */
function boardAndMap(): unknown {
  const model = boardModel(VIEW, PROJECT, PAGE.items, new Map());
  const live = stageLive(VIEW, PAGE.items, []);
  const steps = [
    'build__build',
    'rounds.fix',
    'rounds.review__review',
    'rounds.checks',
    'rounds.verdict__verdict',
    'hostrounds.host__host',
    'hostrounds.hostfix',
    'result',
    'reported',
    null,
  ];
  return {
    columns: model.columns.map(column => ({
      id: column.id,
      cards: column.cards.map(pinnedCard),
    })),
    ended: model.ended.map(row => ({ label: row.label, keys: row.cards.map(c => c.card.key) })),
    map: [...live.positions],
    running: steps.map(step => [
      step,
      [...boardModel(VIEW, PROJECT, [delivering(step)], new Map()).positions],
    ]),
  };
}

test('an old deliver item reads as it did before deliver was retired', () => {
  const actual = {
    item111: masked(itemPage(itemDetail('111'))),
    item1: masked(itemPage(itemDetail('1'))),
    board: JSON.parse(masked(JSON.stringify(boardAndMap()))) as unknown,
  };
  if (process.env.PIN_WRITE === '1') writeFileSync(PINNED, `${JSON.stringify(actual, null, 1)}\n`);
  expect(actual).toEqual(JSON.parse(readFileSync(PINNED, 'utf8')));
  for (const column of boardModel(VIEW, PROJECT, PAGE.items, new Map()).columns)
    for (const { card } of column.cards) expect(card.pillLabel).toBe(PILL_LABEL[card.pill]);
  // The pin is only worth something if it holds the story and the rounds grid.
  expect(actual.item111).toContain('Check rounds');
  expect(actual.item111).toContain('Project checks');
});
