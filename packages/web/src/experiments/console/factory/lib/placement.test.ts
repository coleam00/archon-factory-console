import { describe, expect, test } from 'bun:test';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import type { FactoryItem } from '../../skills/factory';
import {
  delivering,
  endLastRun,
  landRunning,
  PAGE,
  progressOf,
  realItem,
  VIEW,
} from './board.test-fixtures';
import {
  itemColumn,
  pageRunFacts,
  placementInput,
  stageOfStep,
  stageOfWorkflow,
  type ItemColumn,
  type PlacementInput,
  type PlacementRun,
} from './placement';

const view = shippedView;
const run = (
  workflow: string | null,
  status: PlacementRun['status'],
  outcome: string | null = null,
  step: string | null = null,
  failedStep: string | null = null
): PlacementRun => ({ workflow, status, outcome, step, failedStep });
const input = (runs: PlacementRun[], extra: Partial<PlacementInput> = {}): PlacementInput => ({
  runs,
  merged: null,
  ...extra,
});
const where = (column: ItemColumn | null): string | null =>
  column === null ? null : 'stage' in column ? column.stage.id : `ended: ${column.ended}`;

describe('which stage a step is in', () => {
  test('a declared node, or a step inside it', () => {
    expect(stageOfStep(view, 'deliver', 'build__build')?.id).toBe('build');
    expect(stageOfStep(view, 'deliver', 'rounds.review__review')?.id).toBe('checks');
    expect(stageOfStep(view, 'deliver', 'rounds.fix')?.id).toBe('build');
    expect(stageOfStep(view, 'deliver', 'hostrounds.host__host')?.id).toBe('host');
  });

  test('a step no stage names, or one of another workflow, is in none', () => {
    expect(stageOfStep(view, 'deliver', 'rounds')).toBeUndefined();
    expect(stageOfStep(view, 'deliver', 'rounds.fixer')).toBeUndefined();
    expect(stageOfStep(view, 'plan', 'build__build')).toBeUndefined();
  });

  test("a run between steps, or in an unnamed one, is in its workflow's first stage", () => {
    expect(stageOfWorkflow(view, 'deliver', null)?.id).toBe('build');
    expect(stageOfWorkflow(view, 'deliver', 'rounds')?.id).toBe('build');
    expect(stageOfWorkflow(view, 'triage', 'anything')?.id).toBe('triage');
    expect(stageOfWorkflow(view, 'unknown', null)).toBeUndefined();
  });
});

describe('the pack after its work-order upgrade', () => {
  const after = (...runs: PlacementRun[]): string | null => where(itemColumn(view, input(runs)));
  const ready = run('deliver', 'completed', 'ready');

  test('an order running is in Order; one that ended ready moves to Triage', () => {
    expect(after(run('order', 'running', null, 'order'))).toBe('order');
    expect(after(run('order', 'completed', 'ready'))).toBe('triage');
  });

  test('an order refused ends the item at intake', () => {
    expect(after(run('order', 'completed', 'refused'))).toBe('ended: Refused at intake');
  });

  test('a landgate run that completed with no outcome keeps a ready change in Ready to merge', () => {
    expect(after(ready, run('landgate', 'running', null, 'gate'))).toBe('ready');
    expect(after(ready, run('landgate', 'completed'))).toBe('ready');
    // Whatever outcome a later version of the gate returns, `landgate:*` places it.
    expect(after(ready, run('landgate', 'completed', 'held'))).toBe('ready');
  });

  test('a discoveries run after the gate is no stage: the item stays in Ready to merge', () => {
    // The view names no `discoveries` workflow, so its runs are not the view's.
    for (const status of ['running', 'completed', 'failed'] as const)
      expect(after(ready, run('landgate', 'completed'), run(null, status))).toBe('ready');
  });
});

describe('one placement input for every view of an item', () => {
  test('the items read places a captured item as its item page does', () => {
    for (const key of ['1', '2', '3', '6'] as const) {
      const { item, runs } = itemDetail(key);
      if (item.progress === null) throw new Error(`fixture ${key} has progress`);
      const page = placementInput(item, pageRunFacts(item.progress));
      const detail = placementInput(item, new Map(runs.map(f => [f.runId, f])));
      // The detail knows every running run's step; the page only the latest's, which is the
      // one placement reads.
      expect(itemColumn(view, page)).toEqual(itemColumn(view, detail));
      expect(page.runs.map(r => r.workflow)).toEqual(detail.runs.map(r => r.workflow));
    }
  });
});

/** Where the items read places `item`, as the board and the map build its input. */
function placeOf(item: FactoryItem, previous?: string): string | null {
  const facts = item.progress === null ? new Map() : pageRunFacts(item.progress);
  return where(itemColumn(VIEW, placementInput(item, facts), previous));
}

describe('placement rules, first that matches', () => {
  type Also = Partial<PlacementInput> & { previous?: string; view?: typeof view };
  type Row = [rule: string, name: string, runs: PlacementRun[], expected: string, also?: Also];
  const ready = run('deliver', 'completed', 'ready');
  const testing = run('deliver', 'running', null, 'rounds.tests__tests');
  // A deliver run between rounds records only the bare loop group.
  const between = run('deliver', 'running', null, 'rounds');
  const failedAt = (step: string | null) => run('deliver', 'failed', null, null, step);
  const planned = run('plan', 'completed', 'planned');
  const closed = run('triage', 'completed', 'close');
  const rows: Row[] = [
    ['1', 'the stage of its running step', [planned, testing], 'checks', { merged: true }],
    [
      '1',
      'a named step, whatever the previous column',
      [run('deliver', 'running', null, 'rounds.review__review')],
      'checks',
      { previous: 'build' },
    ],
    [
      '1',
      'an unnamed step keeps a previous column that lists the workflow',
      [between],
      'checks',
      { previous: 'checks' },
    ],
    [
      '1',
      "an unnamed step after a column that does not list it: the workflow's first stage",
      [between],
      'build',
      { previous: 'triage' },
    ],
    ['1', "an unnamed step, no previous column: the workflow's first stage", [between], 'build'],
    [
      '1',
      "a running run with no step: the workflow's first stage",
      [run('deliver', 'running')],
      'build',
    ],
    [
      '1 before 2',
      'a land run still running after the merge',
      [ready, run('land', 'running', null, 'land')],
      'ready',
      { merged: true },
    ],
    [
      '1 before 2',
      'a run working a landed card places it',
      [ready, testing],
      'checks',
      { merged: 'pending', previous: 'landed' },
    ],
    ['2', 'its change merged: the landed column', [ready], 'landed', { merged: true }],
    [
      '2',
      'a merge state the host could not report is not a merge',
      [ready],
      'ready',
      { merged: 'unknown' },
    ],
    ...(['pending', 'unknown'] as const).flatMap((merged): Row[] => [
      [
        '2',
        `a landed card stays while its merge is ${merged}`,
        [ready],
        'landed',
        { merged, previous: 'landed' },
      ],
      [
        '2',
        `a card is never moved forward while its merge is ${merged}`,
        [ready],
        'ready',
        { merged, previous: 'ready' },
      ],
    ]),
    [
      '2',
      'a known not-merged takes a card out of landed',
      [ready],
      'ready',
      { merged: false, previous: 'landed' },
    ],
    [
      '3',
      "the last completed run's workflow and outcome",
      [run('triage', 'completed', 'build'), planned],
      'build',
    ],
    [
      '3',
      'a deliver ask after plan planned stays where planned put it',
      [planned, run('deliver', 'completed', 'ask')],
      'build',
    ],
    // The shipped order: deliver ready starts the drain and the land gate; the gate ends first.
    [
      '3',
      'a running discoveries drain, which no stage lists, never moves the item',
      [ready, run('discoveries', 'running'), run('landgate', 'completed')],
      'ready',
    ],
    ...([false, 'unknown', 'pending'] as const).map(
      (merged): Row => ['3', `ended ready, merge ${merged}`, [ready], 'ready', { merged }]
    ),
    [
      '4',
      'an ending by workflow:*',
      [run('triage', 'completed', 'duplicate')],
      'ended: Closed by triage',
      { view: { ...view, endings: { 'triage:*': 'Closed by triage' } } },
    ],
    [
      '4',
      'an ending by exact key',
      [run('plan', 'completed', 'stop')],
      'ended: Stopped at planning',
    ],
    [
      '4',
      'plan stopped after triage said build: the last completed run decides',
      [run('triage', 'completed', 'build'), run('plan', 'completed', 'stop')],
      'ended: Stopped at planning',
    ],
    // Each of triage's verbs: build and narrow go on, park stays open, the rest end.
    ...Object.entries({
      build: 'plan',
      narrow: 'plan',
      park: 'triage',
      close: 'ended: Closed by triage',
      decline: 'ended: Closed by triage',
      deprecate: 'ended: Closed by triage',
      fold: 'ended: Folded into another item',
      recipe: 'ended: Handled another way',
      native: 'ended: Handled another way',
    }).map(
      ([verb, at]): Row => ['4', `triage's verb ${verb}`, [run('triage', 'completed', verb)], at]
    ),
    [
      '3 before 5',
      'a failed deliver after deliver waiting',
      [run('deliver', 'completed', 'waiting'), run('deliver', 'failed')],
      'host',
    ],
    [
      '3 before 5',
      'a failed triage after plan planned',
      [planned, run('triage', 'failed')],
      'build',
    ],
    [
      '3 before 5',
      'a failed deliver after plan planned',
      [planned, failedAt('build__build')],
      'build',
    ],
    ['5', 'a failed step in Checks', [failedAt('rounds.review__review')], 'checks'],
    ['5', 'a failed step in Host', [failedAt('hostrounds.host__host')], 'host'],
    [
      '5',
      "a failed step no stage names: the workflow's first stage",
      [failedAt('rounds')],
      'build',
    ],
    ['5', "a failure with no step: the workflow's first stage", [failedAt(null)], 'build'],
    ['5', "a cancelled run: the workflow's first stage", [run('triage', 'cancelled')], 'triage'],
    // 4 and 5 read the last declared run whatever its status: every status after an ending.
    ['4/5', 'a paused run after an ending', [closed, run('triage', 'paused')], 'order'],
    ['4/5', 'a pending run after an ending', [closed, run('triage', 'pending')], 'order'],
    ['4/5', 'a running run after an ending', [closed, run('triage', 'running')], 'triage'],
    ['4/5', 'a failed run after an ending', [closed, run('triage', 'failed')], 'triage'],
    ['4/5', 'a cancelled run after an ending', [closed, run('triage', 'cancelled')], 'triage'],
    ['4/5', 'an ending again after an ending', [closed, closed], 'ended: Closed by triage'],
    [
      '4/5',
      'an exact ending, then a pending run of its workflow',
      [run('plan', 'completed', 'stop'), run('plan', 'pending')],
      'order',
    ],
    ['6', 'no runs: the first stage', [], 'order'],
    [
      '6',
      'runs of undeclared workflows do not count',
      [run(null, 'running', null, 'build__build')],
      'order',
    ],
  ];

  test.each(rows)('%s: %s', (_rule, _name, runs, expected, also = {}) => {
    const { previous, view: declared = view, ...extra } = also;
    expect(where(itemColumn(declared, input(runs, extra), previous))).toBe(expected);
  });
});

describe('the adapters agree with the rules on captured items', () => {
  test('every real item sits in the column its runs and change put it in', () => {
    expect(PAGE.items.map(item => [item.item.key, placeOf(item)])).toEqual([
      ['8', 'checks'],
      ['5', 'build'],
      ['4', 'build'],
      ['6', 'build'],
      ['3', 'build'],
      ['7', 'landed'],
      ['2', 'landed'],
      ['1', 'landed'],
    ]);
  });

  test('a captured item reaches the rule its runs name through the items read', () => {
    // 1: the review step of round 2.
    expect(placeOf(delivering('rounds.review__review'))).toBe('checks');
    // 1 before 2: a land run still running after the merge.
    expect(placeOf(landRunning())).toBe('ready');
    // 2: merged.
    expect(placeOf(realItem('7'))).toBe('landed');
    // 6: progress that could not be read.
    expect(placeOf({ ...realItem('6'), progress: null })).toBe('order');
  });

  test('the captured item details: item 1 merged, item 3 asked from build, item 6 building', () => {
    const fromDetail = (key: '1' | '3' | '6'): PlacementInput => {
      const detail = itemDetail(key);
      return placementInput(detail.item, new Map(detail.runs.map(f => [f.runId, f])));
    };
    expect(where(itemColumn(view, fromDetail('1')))).toBe('landed');
    expect(where(itemColumn(view, fromDetail('6')))).toBe('build');
    // Item 3's merge state was unknown when it was captured: the placement of `deliver:ask`.
    expect(where(itemColumn(view, fromDetail('3')))).toBe('build');
  });

  test('every outcome comes from the declaration: renamed there, placement follows', () => {
    const { 'deliver:ready': _ready, ...placement } = VIEW.placement;
    const { 'plan:stop': _stop, ...endings } = VIEW.endings;
    const renamed = {
      ...VIEW,
      placement: { ...placement, 'deliver:shipit': 'ready' },
      endings: { ...endings, 'plan:halt': 'Stopped at planning' },
    };
    const at = (item: FactoryItem): string | null =>
      where(itemColumn(renamed, placementInput(item, pageRunFacts(progressOf(item)))));
    const unmerged = (outcome: string): FactoryItem => {
      const item = endLastRun(realItem('1'), 'completed', outcome);
      const progress = progressOf(item);
      if (progress.change === null) throw new Error('item 1 has a change');
      item.progress = { ...progress, change: { ...progress.change, merged: false } };
      return item;
    };
    expect(at(unmerged('shipit'))).toBe('ready');
    // The old name places nothing now: the first stage.
    expect(at(unmerged('ready'))).toBe('order');
    expect(at(endLastRun(realItem('6'), 'completed', 'halt'))).toBe('ended: Stopped at planning');
    expect(at(endLastRun(realItem('6'), 'completed', 'stop'))).not.toMatch(/^ended/);
  });
});
