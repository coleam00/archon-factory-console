import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../../skills/factory';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import { roundsGrid, type RoundsGrid } from './item-rounds-grid';
import { storyVisits } from './item-visits';
import { buildTimeline } from './timeline';

/** The grid of the item's Checks panel. */
function checksGrid(detail: FactoryItemDetail): RoundsGrid | null {
  const visits = storyVisits(shippedView, detail);
  const at = visits.findIndex(visit => visit.stage.id === 'checks');
  const visit = visits[at];
  if (visit === undefined) throw new Error('no Checks panel');
  return roundsGrid(shippedView, detail, buildTimeline(shippedView, detail), visit, visits[at + 1]);
}

/** Each row as its label and its cells' words, stacked cells joined by "+", none "-". */
const table = (grid: RoundsGrid | null): string[][] =>
  (grid?.rows ?? []).map(row => [
    row.label,
    ...row.cells.map(cells => cells.map(cell => cell.text).join('+') || '-'),
  ]);

describe('the rounds grid of a loop-form delivery (one deliver run)', () => {
  const grid = checksGrid(itemDetail('111'));

  test('its two rounds are the columns, with the allowance', () => {
    expect(grid?.columns.map(c => [c.iteration, c.max, c.verdict])).toEqual([
      [1, 3, 'returned'],
      [2, 3, 'approved'],
    ]);
    expect(grid?.columns[0]?.reason).toStartWith('Return. The approach');
    expect(grid?.columns[1]?.reason).toBeNull();
  });

  test('rows: the declared checks in the order the view names them, the fix, CI, the shadow', () => {
    expect(table(grid)).toEqual([
      ['Code review', 'Sent back', 'Approved'],
      ['Test check', 'Sent back', 'Approved'],
      ['Product check', 'Sent back', 'Approved'],
      ['Verdict', 'Sent back', 'Approved'],
      // The fix step ran at the start of round 2, answering round 1.
      ['Build', 'Fixed', '-'],
      ['CI and review', '-', 'Approved'],
      ['Project checks', '4 checks · all passed · 3 min', '4 checks · all passed · 4 min'],
    ]);
    // "Posts the review" only restates the verdict: no declared meaning, no row.
    expect(grid?.rows.map(row => row.label)).not.toContain('Posts the review');
    expect(grid?.rows.at(-1)?.shadow).toBe(true);
    expect(grid?.rows.at(-1)?.cells[0]?.[0]?.meaning).toBe('shadow');
  });
});

describe('the rounds grid of a stage-form delivery (a stage-check run per round)', () => {
  const grid = checksGrid(itemDetail('125'));

  test('each run is one column, numbered and bounded by its own result', () => {
    expect(grid?.columns.map(c => [c.iteration, c.max, c.verdict])).toEqual([
      [1, 3, 'returned'],
      [2, 3, 'returned'],
      [3, 3, 'returned'],
      [4, 4, 'undecided'],
    ]);
  });

  test('the builds between the runs are the fix row; CI after the last round stacks its results', () => {
    expect(table(grid)).toEqual([
      ['Code review', 'Approved', 'Approved', 'Approved', 'Asked you'],
      ['Test check', 'Sent back', 'Approved', 'Approved', 'Approved'],
      ['Product check', 'Approved', 'Sent back', 'Sent back', 'Approved'],
      ['Verdict', 'Sent back', 'Sent back', 'Sent back', 'Asked you'],
      // After round 2 the builder asked first, then fixed once answered.
      ['Build', 'Fixed', 'Asked you+Fixed', 'Fixed', '-'],
      ['CI and review', '-', '-', '-', 'Sent back+Approved'],
      [
        'Project checks',
        '4 checks · all passed · 5 min',
        '4 checks · all passed · 8 min',
        '4 checks · all passed · 5 min',
        '4 checks · all passed · 4 min',
      ],
    ]);
  });
});

describe('a cell', () => {
  test('a check that recorded no outcome in a round reads Not run (an empty cell)', () => {
    const detail = structuredClone(itemDetail('111'));
    const deliver = detail.runs.find(run => run.workflow === 'deliver');
    const round = deliver?.rounds?.rounds[1];
    if (round === undefined) throw new Error('item 111 has two rounds');
    round.steps = round.steps.filter(step => step.node !== 'rounds.product__product');
    expect(table(checksGrid(detail)).find(row => row[0] === 'Product check')).toEqual([
      'Product check',
      'Sent back',
      '-',
    ]);
  });

  test("an outcome the view does not word stays the pack's token", () => {
    const detail = structuredClone(itemDetail('111'));
    const step = detail.runs
      .find(run => run.workflow === 'deliver')
      ?.rounds?.rounds[0]?.steps.find(entry => entry.node === 'rounds.review__review');
    if (step === undefined) throw new Error('item 111 reviewed');
    step.outcome = 'replan';
    const cell = checksGrid(detail)?.rows[0]?.cells[0]?.[0];
    expect([cell?.meaning, cell?.text]).toEqual(['token', 'replan']);
  });
});
