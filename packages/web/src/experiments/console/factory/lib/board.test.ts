import { describe, expect, test } from 'bun:test';
import { formatDateTime } from '../../lib/format';
import { askItem } from '../needs-you.test-fixtures';
import {
  boardModel,
  cardFields,
  filterBoard,
  hiddenColumnsHint,
  movedKeys,
  placeItem,
  type FactoryItem,
} from './board';
import { endLastRun, keepRuns, PAGE, progressOf, realItem, VIEW } from './board.test-fixtures';

const PROJECT = 'cb-1';
const card = (item: FactoryItem, previous?: string) =>
  cardFields(VIEW, PROJECT, item, placeItem(VIEW, item, previous));

/** Item 8 with its deliver run working `step` in round `iteration` of 3. */
function delivering(step: string | null, iteration = 2): FactoryItem {
  const item = realItem('8');
  const progress = progressOf(item);
  const running = progress.running;
  if (running === null) throw new Error('item 8 is running in the fixture');
  item.progress = {
    ...progress,
    running: { ...running, step },
    round: {
      runId: running.runId,
      iteration,
      max: 3,
      rounds: (
        [
          { iteration: 1, verdict: 'returned', outcome: 'return' },
          { iteration: 2, verdict: 'running', outcome: null },
        ] as const
      ).slice(0, iteration),
    },
  };
  return item;
}

describe('every real item, as dev:console served it', () => {
  test('sits in the column its runs and change put it in', () => {
    const where = PAGE.items.map(item => [item.item.key, placeItem(VIEW, item)]);
    expect(where).toEqual([
      ['8', { kind: 'column', stage: 'checks', rule: 1 }],
      ['5', { kind: 'column', stage: 'build', rule: 1 }],
      ['4', { kind: 'column', stage: 'build', rule: 1 }],
      ['6', { kind: 'column', stage: 'build', rule: 3 }],
      ['3', { kind: 'column', stage: 'build', rule: 3 }],
      ['7', { kind: 'column', stage: 'landed', rule: 2 }],
      ['2', { kind: 'column', stage: 'landed', rule: 2 }],
      ['1', { kind: 'column', stage: 'landed', rule: 2 }],
    ]);
  });
});

describe('placement, first rule that matches', () => {
  test('1: the review step of round 2 is in Checks, round 2 of 3', () => {
    const item = delivering('rounds.review__review');
    expect(placeItem(VIEW, item)).toEqual({ kind: 'column', stage: 'checks', rule: 1 });
    expect(card(item).round?.text).toBe('round 2 of 3');
  });

  test('1: a step no stage names keeps the column it was in, when that column lists the workflow', () => {
    // A deliver run between rounds records only the bare loop group.
    const item = delivering('rounds');
    expect(placeItem(VIEW, item, 'checks')).toMatchObject({ stage: 'checks', rule: 1 });
    // Triage does not list deliver, so the item goes to the first stage that does.
    expect(placeItem(VIEW, item, 'triage')).toMatchObject({ stage: 'build', rule: 1 });
  });

  test('1: between steps with no column before, the first stage listing the workflow', () => {
    expect(placeItem(VIEW, delivering(null))).toMatchObject({ stage: 'build', rule: 1 });
  });

  test('1 before 2: a land run still running after it merged the change keeps the item in Ready to land', () => {
    // The land workflow merges, then returns its outcome: the run is still running then.
    const item = realItem('7');
    item.progress = {
      ...progressOf(item),
      running: {
        runId: 'land-run',
        workflow: 'land',
        step: 'land',
        startedAt: '2026-11-17T04:29:00.000Z',
      },
    };
    expect(placeItem(VIEW, item)).toEqual({ kind: 'column', stage: 'ready', rule: 1 });
    expect(card(item)).toMatchObject({ pill: 'running', landedAt: null });
  });

  test('2: a merged change is in Landed', () => {
    expect(placeItem(VIEW, realItem('7'))).toEqual({ kind: 'column', stage: 'landed', rule: 2 });
  });

  test('3: an item whose deliver ended ready, its change not merged yet, is in Ready to land', () => {
    const item = realItem('1');
    const progress = progressOf(item);
    if (progress.change === null) throw new Error('item 1 has a change');
    item.progress = { ...progress, change: { ...progress.change, merged: false, mergedAt: null } };
    expect(placeItem(VIEW, item)).toEqual({ kind: 'column', stage: 'ready', rule: 3 });
  });

  test('3: an item whose merge state is unknown is not taken for landed', () => {
    const item = realItem('1');
    const progress = progressOf(item);
    if (progress.change === null) throw new Error('item 1 has a change');
    item.progress = { ...progress, change: { ...progress.change, merged: 'unknown' } };
    expect(placeItem(VIEW, item)).toMatchObject({ stage: 'ready', rule: 3 });
  });

  test('4: a triage outcome placement does not take folds into "Closed by triage"', () => {
    const item = endLastRun(keepRuns(realItem('6'), 1), 'completed', 'not-now');
    expect(placeItem(VIEW, item)).toEqual({ kind: 'ended', label: 'Closed by triage' });
  });

  test('4: an exact ending key, read from the last run only', () => {
    // Plan stopped after triage said build: the last completed run is plan's, not triage's.
    const item = endLastRun(realItem('6'), 'completed', 'stop');
    expect(placeItem(VIEW, item)).toEqual({ kind: 'ended', label: 'Stopped at planning' });
  });

  test('5: a failed run sits in the stage of the step it failed at', () => {
    const item = endLastRun(keepRuns(realItem('5'), 3), 'failed', null, 'rounds.review__review');
    // Its plan completed `planned`, which rule 3 places; take that away to reach rule 5.
    const progress = progressOf(item);
    const only = {
      ...item,
      runs: item.runs.slice(2),
      progress: { ...progress, runs: progress.runs.slice(2) },
    };
    expect(placeItem(VIEW, only)).toEqual({ kind: 'column', stage: 'checks', rule: 5 });
    const unnamed = endLastRun(only, 'cancelled', null, null);
    expect(placeItem(VIEW, unnamed)).toEqual({ kind: 'column', stage: 'build', rule: 5 });
  });

  test('a failed deliver after a completed plan sits where the plan placed it, marked failed', () => {
    const item = endLastRun(realItem('5'), 'failed', null, 'build__build');
    expect(placeItem(VIEW, item)).toMatchObject({ stage: 'build', rule: 3 });
    expect(card(item)).toMatchObject({
      pill: 'failed',
      stopLine: 'deliver failed at build__build',
    });
  });

  test('6: an item with no runs is in the first stage', () => {
    expect(placeItem(VIEW, keepRuns(realItem('6'), 0))).toEqual({
      kind: 'column',
      stage: 'triage',
      rule: 6,
    });
  });

  test('6: an item whose progress could not be read stays on the board, in the first stage', () => {
    const item = { ...realItem('6'), progress: null };
    expect(placeItem(VIEW, item)).toEqual({ kind: 'column', stage: 'triage', rule: 6 });
    expect(card(item)).toMatchObject({ title: '6', stopLine: 'Its progress could not be read.' });
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

  test('4: the running workflow and step, linking to the run', () => {
    const item = realItem('8');
    expect(card(item).run).toEqual({
      text: 'deliver · rounds.product__product',
      workflow: 'deliver',
      step: 'rounds.product__product',
      href: `/console/p/${PROJECT}/r/${progressOf(item).running!.runId}`,
    });
    expect(card(delivering(null)).run?.text).toBe('deliver');
    expect(card(realItem('6')).run).toBeNull();
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
    });
    expect(card(realItem('3')).change?.label).toBe('the change');
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
    expect(hiddenColumnsHint(columns, new Set(['triage', 'plan', 'build', 'checks', 'host']))).toBe(
      'Scroll for: Ready to land, Landed'
    );
  });

  test('every outcome comes from the declaration: renamed there, placement follows the new names', () => {
    // The declaration renames deliver's `ready` to `shipit` and plan's `stop` to `halt`.
    const { 'deliver:ready': _ready, ...placement } = VIEW.placement;
    const { 'plan:stop': _stop, ...endings } = VIEW.endings;
    const renamed = {
      ...VIEW,
      placement: { ...placement, 'deliver:shipit': 'ready' },
      endings: { ...endings, 'plan:halt': 'Stopped at planning' },
    };
    const unmerged = (outcome: string): FactoryItem => {
      const item = endLastRun(realItem('1'), 'completed', outcome);
      const progress = progressOf(item);
      if (progress.change === null) throw new Error('item 1 has a change');
      item.progress = { ...progress, change: { ...progress.change, merged: false } };
      return item;
    };
    expect(placeItem(renamed, unmerged('shipit'))).toMatchObject({ stage: 'ready', rule: 3 });
    // The old name places nothing now: the item falls back to the first stage.
    expect(placeItem(renamed, unmerged('ready'))).toMatchObject({ stage: 'triage', rule: 6 });
    expect(placeItem(renamed, endLastRun(realItem('6'), 'completed', 'halt'))).toEqual({
      kind: 'ended',
      label: 'Stopped at planning',
    });
    expect(placeItem(renamed, endLastRun(realItem('6'), 'completed', 'stop'))).toMatchObject({
      kind: 'column',
    });
  });
});
