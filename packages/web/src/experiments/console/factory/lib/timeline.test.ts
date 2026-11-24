import { describe, expect, test } from 'bun:test';
import type { FactoryItemDetail } from '../api';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import { buildTimeline, type TimelineRow } from './timeline';

/** An outcome the declaration words, and a pack token it does not, drawn in mono. */
const said = (text: string) => ({ text, mono: false });
const token = (text: string) => ({ text, mono: true });
const timeline = (detail: FactoryItemDetail): TimelineRow[] => buildTimeline(shippedView, detail);

type Run = FactoryItemDetail['item']['runs'][number];
/** Item 1's run `at` (0 triage, 1 plan, 2 deliver) with `patch`, read as `view` does. */
const rowWith = (at: number, patch: Partial<Run>, view = shippedView, workflow?: string) => {
  const detail = itemDetail('1');
  const runs = detail.item.runs.map((run, i) => (i === at ? { ...run, ...patch } : run));
  const facts = detail.runs.map((run, i) => (i === at && workflow ? { ...run, workflow } : run));
  return buildTimeline(view, { ...detail, item: { ...detail.item, runs }, runs: facts })[at];
};
/** Item 1's deliver run read as a completed run of `workflow` with `outcome`. */
const runOf = (workflow: string, outcome: string | null) =>
  rowWith(2, { workflow: `${shippedView.pack}:${workflow}`, outcome }, shippedView, workflow);

describe("each run's outcome, as the declaration words it, and what it did to the item", () => {
  test('an item that landed: one row per run, in start order, each sending it on', () => {
    const detail = itemDetail('1');
    const rows = timeline(detail);
    expect(rows.map(row => [row.workflow, row.outcome, row.kind])).toEqual([
      // Each outcome as the declaration's `placement` reads it: where it sent the item.
      ['triage', said('sent to Link'), 'sent-on'],
      ['plan', said('sent to Build'), 'sent-on'],
      ['deliver', said('sent to Ready to merge'), 'sent-on'],
    ]);
    expect(rows.map(row => row.runId)).toEqual(detail.item.runs.map(run => run.id));
  });

  type Row = ReturnType<typeof rowWith>;
  const cases: [string, Row, { text: string; mono: boolean }, NonNullable<Row>['kind']][] = [
    // No `placement` and no `endings` entry: the pack's token, drawn as an identifier.
    [
      'an untold outcome',
      rowWith(0, { outcome: 'skip' }, { ...shippedView, endings: {} }),
      token('skip'),
      'other',
    ],
    ['an ending', rowWith(0, { outcome: 'fold' }), said('Folded into another item'), 'stopped'],
    ['another ending', rowWith(0, { outcome: 'decline' }), said('Closed by triage'), 'stopped'],
    [
      'parked, not the stage it sits in',
      rowWith(0, { outcome: 'park' }),
      said('Parked by triage'),
      'other',
    ],
    // A check returns the item into Build, a stage before its own; deliver works Build only.
    ['sent back into Build', runOf('stage-check', 'return'), said('sent to Build'), 'returned'],
    ['sent back to Plan', rowWith(2, { outcome: 'replan' }), said('sent to Plan'), 'returned'],
    [
      'back into its own stage',
      rowWith(2, { outcome: 'returned' }),
      said('sent to Build'),
      'sent-on',
    ],
    [
      'into a stage the run works',
      runOf('stage-host', 'waiting'),
      said('sent to CI and review'),
      'sent-on',
    ],
    // `landgate:*` places the item in Ready to merge, the stage the gate itself works.
    ['a gate with no outcome', runOf('landgate', null), said('sent to Ready to merge'), 'sent-on'],
    ['failed', rowWith(2, { status: 'failed' }), said('failed'), 'failed'],
    ['cancelled', rowWith(2, { status: 'cancelled' }), said('cancelled'), 'failed'],
  ];
  for (const [name, row, outcome, kind] of cases)
    test(`${name}: ${outcome.text}, ${kind}`, () => {
      expect(row?.outcome).toEqual(outcome);
      expect(row?.kind).toBe(kind);
    });

  test('both deliver runs of item 3 asked, each with the question it left', () => {
    const detail = itemDetail('3');
    const delivers = timeline(detail).filter(row => row.workflow === 'deliver');
    expect(delivers.map(row => [row.outcome, row.kind])).toEqual([
      [said('asked you'), 'asked'],
      [said('asked you'), 'asked'],
    ]);
    const question = (runId: string | undefined) =>
      detail.item.answers.flatMap(a => (a.kind === 'ask' && a.runId === runId ? [a.question] : []));
    expect(delivers.map(row => row.asked)).toEqual(delivers.map(row => question(row.runId)));
    expect(delivers.map(row => row.asked.length)).toEqual([1, 1]);
  });
});

describe('a run that asked', () => {
  const detail = itemDetail('3');
  const deliver = detail.item.runs.find(run => run.outcome === 'ask');
  if (deliver === undefined) throw new Error('item 3 has a deliver run that asked');
  const rowOf = (changed: FactoryItemDetail) =>
    buildTimeline(shippedView, changed).find(row => row.runId === deliver.id);
  const withItem = (item: Partial<FactoryItemDetail['item']>): FactoryItemDetail => ({
    ...detail,
    item: { ...detail.item, ...item },
  });
  const noAsks = withItem({ answers: [], questions: [] });

  test('with no asks recorded it reads where `placement` sends it', () => {
    expect([rowOf(noAsks)?.outcome, rowOf(noAsks)?.asked]).toEqual([said('sent to Build'), []]);
  });

  test('reads "asked you" over its placement when it left asks on the item', () => {
    const returned = withItem({
      runs: detail.item.runs.map(run =>
        run.id === deliver.id ? { ...run, outcome: 'returned' } : run
      ),
    });
    const row = rowOf(returned);
    expect(row?.outcome).toEqual(said('asked you'));
    expect(row?.asked).toHaveLength(1);
  });
});
