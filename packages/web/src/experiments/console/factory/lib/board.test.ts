import { describe, expect, test } from 'bun:test';
import { formatDateTime } from '../../lib/format';
import { askItem } from '../needs-you.test-fixtures';
import { boardModel, cardFields, filterBoard, hiddenColumnsHint, movedKeys } from './board';
import type { FactoryItem } from '../../skills/factory';
import {
  readyWithMerge,
  delivering,
  endLastRun,
  keepRuns,
  landRunning,
  PAGE,
  progressOf,
  realItem,
  VIEW,
} from './board.test-fixtures';
import { pageItemColumn } from './placement';

const PROJECT = 'cb-1';
const card = (item: FactoryItem, previous?: string) =>
  cardFields(VIEW, PROJECT, item, pageItemColumn(VIEW, item, previous));

describe('cards of placed items', () => {
  test('a running item says its round; a land run still running keeps it out of Landed', () => {
    expect(card(delivering('rounds.review__review')).round?.text).toBe('round 2 of 3');
    const item = landRunning();
    expect(card(item)).toMatchObject({ pill: 'running', landedAt: null });
  });

  test('a failed deliver after a completed plan is marked failed, with the step it failed at', () => {
    expect(card(endLastRun(realItem('5'), 'failed', null, 'build__build'))).toMatchObject({
      pill: 'failed',
      stopLine: 'deliver failed at Writes the change',
    });
  });

  test('an item whose progress could not be read stays on the board and says so', () => {
    const item = { ...realItem('6'), progress: null };
    expect(pageItemColumn(VIEW, item)).toMatchObject({ stage: { id: 'order' } });
    expect(card(item)).toMatchObject({ title: '6', stopLine: 'Its progress could not be read.' });
  });

  test('the board keeps a running item in its previous column on a step no stage names', () => {
    const item = delivering('rounds');
    const position = (previous: Map<string, string>) =>
      boardModel(VIEW, PROJECT, [item], previous).positions.get('8');
    expect(position(new Map([['8', 'checks']]))).toBe('checks');
    expect(position(new Map())).toBe('build');
  });
});

describe('card fields, in order', () => {
  test('1: key and title, the title falling back to the key', () => {
    expect(card(realItem('7'))).toMatchObject({
      key: '7',
      title:
        'Needs you: open asks and paused runs listed with the recommendation first, answered in place',
    });
    const untitled = realItem('7');
    untitled.progress = { ...progressOf(untitled), title: null };
    expect(card(untitled).title).toBe('7');
  });

  test('2: the state pill', () => {
    expect(card(realItem('8')).pill).toBe('running');
    expect(card(realItem('6')).pill).toBe('waiting');
    expect(card(realItem('7')).pill).toBe('landed');
    expect(card({ ...realItem('6'), questions: [askItem()] }).pill).toBe('needs-you');
    expect(card(endLastRun(realItem('5'), 'failed', null)).pill).toBe('failed');
  });

  test('2: an item in Landed through a placement, its merge state not known, is landed', () => {
    const item = endLastRun(realItem('6'), 'completed', 'landed');
    item.runs[item.runs.length - 1] = { ...item.runs.at(-1)!, workflow: 'land' };
    const progress = progressOf(item);
    item.progress = {
      ...progress,
      runs: progress.runs.map((run, index, all) =>
        index === all.length - 1 ? { ...run, workflow: 'land' } : run
      ),
    };
    expect(card(item)).toMatchObject({ pill: 'landed', landedAt: null });
  });

  test('3: the round, with a dot per round in plain words', () => {
    expect(card(realItem('3')).round).toEqual({
      text: 'round 2 of 3',
      dots: [
        { iteration: 1, verdict: 'returned', label: 'round 1: returned' },
        { iteration: 2, verdict: 'undecided', label: 'round 2: needs a decision' },
      ],
    });
    expect(card(realItem('2')).round?.dots.map(dot => dot.label)).toEqual([
      'round 1: returned',
      'round 2: returned',
      'round 3: approved',
    ]);
    const unbounded = realItem('3');
    const progress = progressOf(unbounded);
    unbounded.progress = { ...progress, round: { ...progress.round!, max: null } };
    expect(card(unbounded).round?.text).toBe('round 2');
    expect(card(realItem('6')).round).toBeNull();
  });

  test('4: the running stage, step name and round, linking to the run', () => {
    const item = realItem('8');
    expect(card(item).run).toEqual({
      parts: ['Checks', 'Product check', 'round 1'],
      text: 'Checks · Product check · round 1',
      step: 'rounds.product__product',
      href: `/console/p/${PROJECT}/r/${progressOf(item).running!.runId}`,
    });
    expect(card(delivering('build__build')).run?.text).toBe('Build · Writes the change');
    expect(card(delivering(null)).run?.text).toBe('Build · between steps');
    expect(card(realItem('6')).run).toBeNull();
  });

  test('4: on a step no stage names, the run line names the column the card holds', () => {
    const item = delivering('rounds.shown');
    const model = boardModel(VIEW, PROJECT, [item], new Map([[item.item.key, 'checks']]));
    const checks = model.columns.find(column => column.stage === 'checks');
    expect(checks?.cards.map(placed => placed.card.run?.text)).toEqual([
      'Checks · Posts the review · round 2',
    ]);
  });

  test("4: a round from another run is not this run's round", () => {
    const item = delivering('rounds.fix');
    const progress = progressOf(item);
    item.progress = { ...progress, round: { ...progress.round!, runId: 'an-earlier-run' } };
    expect(card(item).run?.text).toBe('Build · Fixes what came back');
  });

  test('5: returned ×N, linking to the item page', () => {
    expect(card(realItem('3')).returned).toEqual({
      count: 2,
      href: `/console/p/${PROJECT}/factory/items/3`,
    });
    expect(card(realItem('6')).returned).toBeNull();
  });

  test('6: the change, by its pull request number when known', () => {
    expect(card(realItem('7')).change).toEqual({
      href: 'https://github.com/coleam00/archon-factory-console/pull/13',
      label: 'PR #13',
      mergeState: null,
    });
    // The fixture's lookup for item 3 could not reach its pull request: the card says so.
    expect(card(realItem('3')).change).toMatchObject({
      label: 'the change',
      mergeState: 'unknown',
    });
    expect(card(realItem('6')).change).toBeNull();
  });

  test('7: in Landed, when it landed in local time', () => {
    const item = realItem('7');
    expect(card(item).landedAt).toBe(formatDateTime('2026-11-17T04:30:22Z'));
    expect(card(realItem('3')).landedAt).toBeNull();
  });

  test('8: what an item that needs you asks, what stopped a failed one', () => {
    const asking = { ...realItem('6'), questions: [askItem()] };
    expect(card(asking).stopLine).toBe('Which base should the change target?');
    const cancelled = endLastRun(realItem('5'), 'cancelled', null);
    expect(card(cancelled).stopLine).toBe('deliver was cancelled');
    expect(card(realItem('8')).stopLine).toBeNull();
  });
});

describe('the board', () => {
  test('columns are the declared stages in order, landed among them, with the folded endings', () => {
    const ended = endLastRun(keepRuns(realItem('6'), 1), 'completed', 'not-now');
    const model = boardModel(
      VIEW,
      PROJECT,
      [...PAGE.items.filter(i => i.item.key !== '6'), ended],
      new Map()
    );
    expect(model.columns.map(column => [column.label, column.cards.length])).toEqual([
      ['Order', 0],
      ['Triage', 0],
      ['Plan', 0],
      ['Build', 3],
      ['Checks', 1],
      ['CI and review', 0],
      ['Ready to land', 0],
      ['Landed', 3],
    ]);
    expect(model.ended).toEqual([
      {
        label: 'Closed by triage',
        cards: [expect.objectContaining({ card: expect.objectContaining({ key: '6' }) })],
      },
    ]);
    expect(model.positions.get('6')).toBe('ended:Closed by triage');
  });

  test('the filter narrows the columns by key or title; positions keep every item', () => {
    const board = boardModel(VIEW, PROJECT, PAGE.items, new Map());
    const keys = (query: string): string[] =>
      filterBoard(board, query).columns.flatMap(column => column.cards.map(p => p.card.key));
    expect(keys('NEEDS YOU')).toEqual(['7']);
    expect(keys('3')).toEqual(['3']);
    expect(keys('  ')).toHaveLength(PAGE.items.length);
    expect(filterBoard(board, 'NEEDS YOU').positions.size).toBe(PAGE.items.length);
  });

  test('a card that changed position moved; one new to the board did not', () => {
    const before = new Map([
      ['1', 'ready'],
      ['8', 'build'],
    ]);
    const after = new Map([
      ['1', 'landed'],
      ['8', 'build'],
      ['9', 'triage'],
    ]);
    expect(movedKeys(before, after)).toEqual(['1']);
  });

  test('the hint names the columns scrolled out of view', () => {
    const columns = boardModel(VIEW, PROJECT, [], new Map()).columns;
    expect(hiddenColumnsHint(columns, new Set(columns.map(c => c.stage)))).toBeNull();
    expect(
      hiddenColumnsHint(columns, new Set(['order', 'triage', 'plan', 'build', 'checks', 'host']))
    ).toBe('Scroll for: Ready to land, Landed');
  });
});

describe('a column waiting on a merge answer', () => {
  const pendingColumns = (items: FactoryItem[], show?: Parameters<typeof filterBoard>[2]) =>
    filterBoard(boardModel(VIEW, 'cb-1', items, new Map()), '', show)
      .columns.filter(column => column.pending)
      .map(column => column.stage);

  test('the column holding a pending item and the landed column, no other', () => {
    const items = [...PAGE.items, readyWithMerge('p', 'pending')];
    expect(pendingColumns(items)).toEqual(['ready', VIEW.landed.stage]);
    const card = boardModel(VIEW, 'cb-1', items, new Map())
      .columns.flatMap(column => column.cards)
      .find(placed => placed.card.key === 'p')?.card;
    expect(card?.change?.mergeState).toBe('pending');
  });

  test('a board opened from a landed number keeps the landed column loading', () => {
    const items = [...PAGE.items, readyWithMerge('p', 'pending')];
    expect(pendingColumns(items, 'landed')).toContain(VIEW.landed.stage);
    expect(pendingColumns(items, 'landed-today')).toContain(VIEW.landed.stage);
  });

  test('a settled unknown is counted where it sits', () => {
    expect(pendingColumns([...PAGE.items, readyWithMerge('u', 'unknown')])).toEqual([]);
  });
});
