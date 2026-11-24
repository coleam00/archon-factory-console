import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import { roundHeading, roundsGrid, type GridColumn, type RoundsGrid } from './item-rounds-grid';
import { storyVisits } from './item-visits';
import { buildTimeline } from './timeline';

type Declaration = typeof shippedView;

/**
 * The shipped view with the retired deliver workflow's rounds declared again, as a loop: the
 * shipped view no longer declares them, so this keeps the loop-form grid exercised on runs
 * captured from it. Its rounds count where deliver does, on Build.
 */
function deliverRoundsView(): Declaration {
  const verdict = 'rounds.verdict__verdict';
  return {
    ...shippedView,
    rounds: [{ workflow: 'deliver', loop: 'rounds' }, ...[shippedView.rounds ?? []].flat()],
    returns: [
      { workflow: 'deliver', node: verdict, outcome: 'return' },
      ...(shippedView.returns ?? []),
    ],
    approves: [
      { workflow: 'deliver', node: verdict, outcome: 'approve' },
      ...(shippedView.approves ?? []),
    ],
    verdicts: {
      ...shippedView.verdicts,
      deliver: {
        'rounds.review__review': { approve: 'approved', return: 'returned', ask: 'asked' },
        'rounds.tests__tests': { sound: 'approved', return: 'returned', ask: 'asked' },
        'rounds.product__product': { approve: 'approved', return: 'returned', ask: 'asked' },
        [verdict]: { ask: 'asked' },
      },
    },
    steps: {
      ...shippedView.steps,
      deliver: {
        'rounds.review__review': 'Code review',
        'rounds.tests__tests': 'Test check',
        'rounds.product__product': 'Product check',
        [verdict]: 'Verdict',
      },
    },
  };
}

/** The grid of the item's first panel on `stage`. */
function stageGrid(view: Declaration, detail: FactoryItemDetail, stage: string): RoundsGrid | null {
  const visits = storyVisits(view, detail);
  const at = visits.findIndex(visit => visit.stage.id === stage);
  const visit = visits[at];
  if (visit === undefined) throw new Error(`no ${stage} panel`);
  return roundsGrid(view, detail, buildTimeline(view, detail), visit, visits[at + 1]);
}

/** The columns of every panel on `stage`, in order: a replan can split the panel. */
function stageColumns(view: Declaration, detail: FactoryItemDetail, stage: string): GridColumn[] {
  const visits = storyVisits(view, detail);
  const timeline = buildTimeline(view, detail);
  return visits.flatMap((visit, at) =>
    visit.stage.id === stage
      ? (roundsGrid(view, detail, timeline, visit, visits[at + 1])?.columns ?? [])
      : []
  );
}

/** `detail` with a copy of run `runId`, as `copyId`, placed in the item's runs right after `afterId`. */
function withRunCopy(
  detail: FactoryItemDetail,
  runId: string,
  copyId: string,
  afterId: string
): FactoryItemDetail {
  const fact = detail.runs.find(run => run.runId === runId);
  const entry = detail.item.runs.find(run => run.id === runId);
  const at = detail.item.runs.findIndex(run => run.id === afterId);
  if (fact === undefined || entry === undefined || at === -1) throw new Error('no such run');
  detail.runs.push({ ...structuredClone(fact), runId: copyId });
  detail.item.runs.splice(at + 1, 0, { ...structuredClone(entry), id: copyId });
  return detail;
}

/** Each row as its label and its cells' words, stacked cells joined by "+", none "-". */
const table = (grid: RoundsGrid | null): string[][] =>
  (grid?.rows ?? []).map(row => [
    row.label,
    ...row.cells.map(cells => cells.map(cell => cell.text).join('+') || '-'),
  ]);

describe('the rounds grid of a loop-form delivery (one deliver run)', () => {
  // Deliver counts in Build, so its rounds are the Build panel's grid.
  const grid = stageGrid(deliverRoundsView(), itemDetail('111'), 'build');

  test('its two rounds are the columns, with the allowance', () => {
    expect(grid?.columns.map(c => [c.iteration, c.max, c.verdict])).toEqual([
      [1, 3, 'returned'],
      [2, 3, 'approved'],
    ]);
    expect(grid?.columns[0]?.reason).toStartWith('Return. The approach');
    expect(grid?.columns[1]?.reason).toBeNull();
  });

  test('rows: the declared checks, in the order the view names them', () => {
    expect(table(grid)).toEqual([
      ['Code review', 'Sent back', 'Approved'],
      ['Test check', 'Sent back', 'Approved'],
      ['Product check', 'Sent back', 'Approved'],
      ['Verdict', 'Sent back', 'Approved'],
    ]);
  });
});

describe('the rounds grid of a stage-form delivery (a stage-check run per round)', () => {
  const grid = stageGrid(shippedView, itemDetail('125'), 'checks');

  test('each run is one column, bounded by its own result; the builds between are the fix row', () => {
    expect(grid?.columns.map(c => [c.iteration, c.max, c.verdict])).toEqual([
      [1, 3, 'returned'],
      [2, 3, 'returned'],
      [3, 3, 'returned'],
      [4, 4, 'undecided'],
    ]);
    // The builds between the runs are the fix row; CI after the last round stacks its results.
    expect(table(grid)).toEqual([
      ['Code review', 'Approved', 'Approved', 'Approved', 'Asked you'],
      ['Test check', 'Sent back', 'Approved', 'Approved', 'Approved'],
      ['Product check', 'Approved', 'Sent back', 'Sent back', 'Approved'],
      ['Verdict', 'Sent back', 'Sent back', 'Sent back', 'Asked you'],
      // After round 2 the builder asked first, then fixed once answered.
      ['Build', 'Fixed', 'Asked you+Fixed', 'Fixed', '-'],
      ['CI and review', '-', '-', '-', 'Sent back+Approved'],
    ]);
  });
});

describe('round numbers on the item', () => {
  test('two loop-form delivery runs with no replan: each counts its own rounds, named by its run', () => {
    // Item 3's capture is such an item: each deliver run ended in an ask, and the answer
    // launched the next. Item 111 is used for its recorded rounds.
    const base = structuredClone(itemDetail('111'));
    const deliver = base.runs.find(run => run.workflow === 'deliver')?.runId;
    if (deliver === undefined) throw new Error('111 delivered');
    const columns = stageColumns(
      deliverRoundsView(),
      withRunCopy(base, deliver, 'second-deliver', deliver),
      'build'
    );
    expect(columns.map(column => [column.number, column.max, column.delivery])).toEqual([
      [1, 3, 1],
      [2, 3, 1],
      [1, 3, 2],
      [2, 3, 2],
    ]);
    expect(columns.map(roundHeading)).toEqual([
      'Delivery 1 · round 1 of 3',
      'Delivery 1 · round 2 of 3',
      'Delivery 2 · round 1 of 3',
      'Delivery 2 · round 2 of 3',
    ]);
  });
});
