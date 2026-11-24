import { describe, expect, test } from 'bun:test';
import { formatDateTime } from '../../lib/format';
import { askItem } from '../../lib/needs-you.test-fixtures';
import { needsYouCount } from '../../lib/needs-you';
import {
  boardModel,
  cardFields,
  columnChips,
  filterBoard,
  hiddenColumnsHint,
  movedKeys,
  newRoundRunning,
} from './board';
import type { FactoryItem } from '../../skills/factory';
import {
  readyWithMerge,
  delivering,
  endLastRun,
  keepRuns,
  landRunning,
  PAGE,
  declaredAwaits,
  lastRunAs,
  needsShaping,
  progressOf,
  realItem,
  VIEW,
  FIXTURE_NOW,
} from './board.test-fixtures';
import { pageItemColumn, stageOfWorkflow } from './placement';
import { coveringCard } from './step-facts';

const PROJECT = 'cb-1';
const card = (item: FactoryItem, previous?: string) =>
  cardFields(VIEW, PROJECT, item, pageItemColumn(VIEW, item, previous));

/** Item 6 ended by a `land` run that completed `landed`: in Merged through a placement alone. */
function landedByPlacement(): FactoryItem {
  const item = endLastRun(realItem('6'), 'completed', 'landed');
  item.runs[item.runs.length - 1] = { ...item.runs.at(-1)!, workflow: 'land' };
  const progress = progressOf(item);
  const runs = progress.runs.map((run, i, all) =>
    i === all.length - 1 ? { ...run, workflow: 'land' } : run
  );
  item.progress = { ...progress, runs };
  return item;
}

const asking = (item: FactoryItem): FactoryItem => ({ ...item, questions: [askItem()] });

describe('card fields, in order', () => {
  test('1: key and title, the title falling back to the key', () => {
    expect(card(realItem('7'))).toMatchObject({
      key: '7',
      title:
        'Needs you: open asks and paused runs listed with the recommendation first, answered in place',
    });
    const untitled = realItem('7');
    untitled.progress = { ...progressOf(untitled), title: null };
    expect(card(untitled).title).toBe('#7');
  });

  test.each([
    ['running', () => realItem('8'), 'running'],
    ['waiting', () => realItem('6'), 'waiting'],
    ['merged', () => realItem('7'), 'landed'],
    ['an open ask', () => asking(realItem('6')), 'needs-you'],
    [
      'an open ask on an item needing shaping',
      () => asking(needsShaping('9s', ['W?'])),
      'needs-you',
    ],
    ['failed', () => endLastRun(realItem('5'), 'failed', null), 'failed'],
    ['a land run still running after the merge', landRunning, 'running'],
    ['in Merged by a placement, merge state not known', landedByPlacement, 'landed'],
  ] as const)('2: the state pill: %s', (_name, item, pill) => {
    expect(card(item()).pill).toBe(pill);
  });

  test('2: only a merge known merged shows when it merged', () => {
    expect(card(landRunning()).mergedAt).toBeNull();
    expect(card(landedByPlacement()).mergedAt).toBeNull();
  });

  test('an item whose progress could not be read stays on the board and says so', () => {
    const item = { ...realItem('6'), progress: null };
    expect(card(item)).toMatchObject({ title: '#6', stopLine: 'Its progress could not be read.' });
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

  test('3: a stage-check run going now is a round with no number yet: a running dot', () => {
    const item = realItem('3');
    const progress = progressOf(item);
    const running = {
      runId: 'check-next',
      workflow: 'stage-check',
      step: 'review__review',
      startedAt: '2026-11-21T12:00:00.000Z',
    };
    item.progress = { ...progress, running };
    expect(newRoundRunning(VIEW, item.progress)).toBe(true);
    const labels = (it: FactoryItem) => card(it).round?.dots.map(dot => dot.label);
    expect(card(item).round?.text).toBe('round 2 of 3, next one running');
    expect(labels(item)).toEqual([
      'round 1: returned',
      'round 2: needs a decision',
      'next round: running',
    ]);
    // No stage-check round recorded yet: the first is running.
    item.progress = { ...progress, running, round: null };
    expect(card(item).round?.text).toBe('first round running');
    expect(labels(item)).toEqual(['first round: running']);
    // A deliver run going now, not yet in its loop, adds none: deliver's loop is a loop-form
    // source, which numbers its own rounds, so its card reads as it always has.
    item.progress = { ...progress, running: { ...running, workflow: 'deliver' } };
    expect(newRoundRunning(VIEW, item.progress)).toBe(false);
    expect(card(item).round?.text).toBe('round 2 of 3');
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
    const model = boardModel(
      VIEW,
      PROJECT,
      [item],
      new Map([[item.item.key, 'checks']]),
      FIXTURE_NOW
    );
    const checks = model.columns.find(column => column.id === 'checks-review');
    expect(checks?.cards.map(placed => placed.card.run?.text)).toEqual([
      'Checks · Posts the review · round 2',
    ]);
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

  test('6: a change the host has not named yet is "the change", with no link', () => {
    const item = readyWithMerge('p', 'pending');
    const progress = progressOf(item);
    if (progress.change === null) throw new Error('readyWithMerge has a change');
    item.progress = { ...progress, change: { ...progress.change, url: null, number: null } };
    expect(card(item).change).toEqual({ href: null, label: 'the change', mergeState: 'pending' });
  });

  test('7: in Merged, when it merged in local time', () => {
    const item = realItem('7');
    expect(card(item).mergedAt).toBe(formatDateTime('2026-11-17T04:30:22Z'));
    expect(card(realItem('3')).mergedAt).toBeNull();
  });

  test('a card names the stage it waits in; a running one its stage and step; a merged one none', () => {
    expect(card(keepRuns(realItem('6'), 2)).stage).toBe('Build');
    const running = card(delivering('rounds.review__review'));
    expect(running.stage).toBe('Checks');
    expect(running.run?.text).toBe('Checks · Code review · round 2');
    expect(card(realItem('7'))).toMatchObject({ pill: 'landed', stage: null });
  });

  test('8: what an item that needs you asks, what stopped a failed one', () => {
    expect(card(asking(realItem('6'))).stopLine).toBe('Which base should the change target?');
    expect(card(endLastRun(realItem('5'), 'failed', null, 'build__build')).stopLine).toBe(
      'Build failed at Writes the change'
    );
    expect(card(endLastRun(realItem('5'), 'cancelled', null)).stopLine).toBe('Build was stopped');
    expect(card(realItem('8')).stopLine).toBeNull();
  });
});

describe('the board', () => {
  test('columns are the declared columns in order, Merged among them; an ending is set aside', () => {
    const ended = endLastRun(keepRuns(realItem('6'), 1), 'completed', 'close');
    const model = boardModel(
      VIEW,
      PROJECT,
      [...PAGE.items.filter(i => i.item.key !== '6'), ended],
      new Map(),
      FIXTURE_NOW
    );
    expect(model.columns.map(column => [column.label, column.cards.length])).toEqual([
      ['Intake', 0],
      ['Plan & build', 3],
      ['Checks & review', 1],
      ['Ready to merge', 0],
      ['Merged', 3],
    ]);
    expect(model.landedColumn).toBe('merged');
    expect(model.setAside.map(entry => [entry.placed.card.key, entry.kind, entry.why])).toEqual([
      ['6', 'ended', 'Closed by triage'],
    ]);
    expect(model.positions.get('6')).toBe('ended:Closed by triage');
  });

  test('the filter narrows the columns by key or title; positions keep every item', () => {
    const board = boardModel(VIEW, PROJECT, PAGE.items, new Map(), FIXTURE_NOW);
    const keys = (query: string): string[] =>
      filterBoard(board, query, undefined, FIXTURE_NOW).columns.flatMap(column =>
        column.cards.map(p => p.card.key)
      );
    expect(keys('NEEDS YOU')).toEqual(['7']);
    expect(keys('3')).toEqual(['3']);
    expect(keys('  ')).toHaveLength(PAGE.items.length);
    expect(filterBoard(board, 'NEEDS YOU', undefined, FIXTURE_NOW).positions.size).toBe(
      PAGE.items.length
    );
  });

  test('the filter finds the members of a work order by its key', () => {
    // 5 is part of 48 by its order run's result; 3 by its order run's result too, of 60.
    const items = PAGE.items.map(item =>
      item.item.key === '5' || item.item.key === '3'
        ? {
            ...item,
            progress: { ...progressOf(item), partOf: item.item.key === '5' ? '48' : '60' },
          }
        : item
    );
    const board = boardModel(VIEW, PROJECT, items, new Map(), FIXTURE_NOW);
    const keys = (model: typeof board): string[] =>
      model.columns.flatMap(column => column.cards.map(p => p.card.key));
    expect(keys(filterBoard(board, '48', undefined, FIXTURE_NOW))).toEqual(['5']);
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
    const columns = boardModel(VIEW, PROJECT, [], new Map(), FIXTURE_NOW).columns;
    expect(hiddenColumnsHint(columns, new Set(columns.map(c => c.id)))).toBeNull();
    expect(hiddenColumnsHint(columns, new Set(['intake', 'plan-build', 'checks-review']))).toBe(
      'Scroll for: Ready to merge, Merged'
    );
  });
});

describe('a column waiting on a merge answer', () => {
  const pendingColumns = (items: FactoryItem[], show?: Parameters<typeof filterBoard>[2]) =>
    filterBoard(boardModel(VIEW, 'cb-1', items, new Map(), FIXTURE_NOW), '', show, FIXTURE_NOW)
      .columns.filter(column => column.pending)
      .map(column => column.id);

  test('the column holding a pending item and the landed column, no other', () => {
    const items = [...PAGE.items, readyWithMerge('p', 'pending')];
    expect(pendingColumns(items)).toEqual(['ready', 'merged']);
  });

  test('a board opened from a landed number keeps the landed column loading', () => {
    const items = [...PAGE.items, readyWithMerge('p', 'pending')];
    expect(pendingColumns(items, 'landed')).toContain('merged');
    expect(pendingColumns(items, 'landed-today')).toContain('merged');
  });
});

describe('grouped columns', () => {
  test('an item triage sent to shaping waits on you in Intake, its questions on its line', () => {
    const questions = ['Which surfaces?', 'Who owns it?', 'Is it one change?', 'By when?'];
    const model = boardModel(
      VIEW,
      PROJECT,
      [needsShaping('9s', questions)],
      new Map(),
      FIXTURE_NOW
    );
    const intake = model.columns.find(column => column.id === 'intake')?.cards ?? [];
    expect(intake.map(({ card }) => [card.key, card.pillLabel, card.stage, card.stopLine])).toEqual(
      [['9s', 'Needs shaping', 'Triage', 'Which surfaces?']]
    );
    expect(intake[0]?.card.stopCount).toBe('4 questions');
    expect(columnChips(intake)).toEqual([{ pill: 'needs-you', count: 1 }]);
    // With no questions recorded, the line is its reason; one question needs no count.
    expect(card(needsShaping('9t', [])).stopLine).toBe('Worth doing; the scope is open.');
    expect(card(needsShaping('9u', ['Which?'])).stopCount).toBeNull();
  });

  test('close: dropped ends the item, reshape waits in Intake, not closed is set aside in its words', () => {
    // The server reads a declared `parked` outcome so: its label, and the run's why.
    const notClosed = lastRunAs('c3', 'close', 'not_closed');
    const parked = VIEW.parked?.['close:not_closed'];
    if (parked === undefined || notClosed.progress === null)
      throw new Error('the shipped view parks close:not_closed');
    notClosed.progress = {
      ...notClosed.progress,
      parked: { label: parked.label, why: 'Refused.' },
    };
    const shaped = lastRunAs('c2', 'close', 'reshape', declaredAwaits('close:reshape', null, []));
    const model = boardModel(
      VIEW,
      PROJECT,
      [lastRunAs('c1', 'close', 'dropped'), shaped, notClosed],
      new Map(),
      FIXTURE_NOW
    );
    expect(model.setAside.map(entry => [entry.placed.card.key, entry.kind, entry.why])).toEqual([
      ['c1', 'ended', 'Dropped by you'],
      ['c3', 'parked', 'The forge would not close the PR: close or draft it by hand'],
    ]);
    const intake = model.columns.find(column => column.id === 'intake')?.cards;
    expect(intake?.map(placed => [placed.card.key, placed.card.pillLabel])).toEqual([
      ['c2', 'Needs shaping'],
    ]);
    // Nothing the console reads sees a PR closed by hand: not waiting on you.
    expect(needsYouCount({ items: [] }, [notClosed])).toBe(0);
  });

  test('a stage-check or stage-host run writing the report is in its stage, on the Report card', () => {
    expect(stageOfWorkflow(VIEW, 'stage-check', 'report__report')?.id).toBe('checks');
    expect(stageOfWorkflow(VIEW, 'stage-host', 'report__report')?.id).toBe('host');
    expect(coveringCard(VIEW, 'stage-check', 'report__report')?.title).toBe('Report');
    expect(coveringCard(VIEW, 'stage-host', 'report__report')?.title).toBe('Report');
  });

  test("a column's chips count its cards by state, only states above 0", () => {
    const model = boardModel(
      VIEW,
      PROJECT,
      [
        delivering('build__build'),
        realItem('5'),
        asking(realItem('6')),
        keepRuns(realItem('3'), 2),
      ],
      new Map(),
      FIXTURE_NOW
    );
    const work = model.columns.find(column => column.id === 'plan-build');
    expect(columnChips(work?.cards ?? [])).toEqual([
      { pill: 'running', count: 2 },
      { pill: 'needs-you', count: 1 },
      { pill: 'waiting', count: 1 },
    ]);
  });
});
