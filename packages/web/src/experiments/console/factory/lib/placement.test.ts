import { describe, expect, test } from 'bun:test';
import { itemDetail, shippedView } from '../item-detail.test-fixtures';
import {
  itemColumn,
  itemState,
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
  step: string | null = null
): PlacementRun => ({ workflow, status, outcome, step });
const input = (runs: PlacementRun[], extra: Partial<PlacementInput> = {}): PlacementInput => ({
  runs,
  merged: null,
  needsYou: false,
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

describe('where an item sits', () => {
  test('1. a running run: the stage of its running step', () => {
    const runs = [
      run('plan', 'completed', 'planned'),
      run('deliver', 'running', null, 'rounds.tests__tests'),
    ];
    expect(where(itemColumn(view, input(runs, { merged: true })))).toBe('checks');
  });

  test('2. its change merged: the landed column', () => {
    expect(
      where(itemColumn(view, input([run('deliver', 'completed', 'ready')], { merged: true })))
    ).toBe('landed');
    // A merge state the host could not report is not a merge.
    expect(
      where(itemColumn(view, input([run('deliver', 'completed', 'ready')], { merged: 'unknown' })))
    ).toBe('ready');
  });

  test("3. the last completed run's workflow and outcome, through placement", () => {
    const runs = [run('triage', 'completed', 'build'), run('plan', 'completed', 'planned')];
    expect(where(itemColumn(view, input(runs)))).toBe('build');
    expect(where(itemColumn(view, input([...runs, run('deliver', 'completed', 'ask')])))).toBe(
      'build'
    );
  });

  test('4. an ending: off the board with its label, wildcard or exact', () => {
    expect(where(itemColumn(view, input([run('triage', 'completed', 'duplicate')])))).toBe(
      'ended: Closed by triage'
    );
    expect(where(itemColumn(view, input([run('plan', 'completed', 'stop')])))).toBe(
      'ended: Stopped at planning'
    );
  });

  test('5. the last run failed or was cancelled: the stage of its workflow', () => {
    expect(where(itemColumn(view, input([run('deliver', 'failed')])))).toBe('build');
    expect(where(itemColumn(view, input([run('triage', 'cancelled')])))).toBe('triage');
  });

  test('6. otherwise the first stage; runs of undeclared workflows do not count', () => {
    expect(where(itemColumn(view, input([])))).toBe('triage');
    expect(where(itemColumn(view, input([run(null, 'running', null, 'build__build')])))).toBe(
      'triage'
    );
  });

  test('the captured items: item 1 merged, item 3 asked from build, item 6 building', () => {
    const fromDetail = (key: '1' | '3' | '6'): PlacementInput => {
      const detail = itemDetail(key);
      const facts = new Map(detail.runs.map(fact => [fact.runId, fact]));
      return input(
        detail.item.runs.map(itemRun => ({
          workflow: facts.get(itemRun.id)?.workflow ?? null,
          status: itemRun.status,
          outcome: itemRun.outcome,
          step: facts.get(itemRun.id)?.step ?? null,
        })),
        { merged: detail.item.progress?.change?.merged ?? null }
      );
    };
    expect(where(itemColumn(view, fromDetail('1')))).toBe('landed');
    expect(where(itemColumn(view, fromDetail('6')))).toBe('build');
    // Item 3's merge state was unknown when it was captured: the placement of `deliver:ask`.
    expect(where(itemColumn(view, fromDetail('3')))).toBe('build');
  });
});

describe('the state pill', () => {
  test('running, then needs you, then landed, then failed, else waiting', () => {
    const working = run('deliver', 'running', null, 'build__build');
    expect(itemState(input([working], { needsYou: true }))).toBe('running');
    expect(itemState(input([run('deliver', 'completed', 'ask')], { needsYou: true }))).toBe(
      'needs-you'
    );
    expect(itemState(input([run('deliver', 'completed', 'ready')], { merged: true }))).toBe(
      'landed'
    );
    expect(itemState(input([run('deliver', 'cancelled')]))).toBe('failed');
    expect(itemState(input([run('deliver', 'failed'), run('deliver', 'completed', 'ready')]))).toBe(
      'waiting'
    );
  });
});
