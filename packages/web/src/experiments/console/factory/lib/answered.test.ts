import { describe, expect, test } from 'bun:test';
import { shippedView } from '../item-detail.test-fixtures';
import { asksSettledRunId, recentlySettled } from './answered';
import { itemWith, run, settledItem } from './map.test-fixtures';

const plan = settledItem(
  'p',
  run('plan', 'completed', 'ask'),
  '2026-11-17T10:00:00.000Z',
  run('plan', 'running', null, 'plan')
);
const deliver = settledItem(
  'd',
  run('deliver', 'completed', 'ask'),
  '2026-11-17T11:00:00.000Z',
  run('deliver', 'completed', 'ready')
);
const waiting = settledItem('w', run('plan', 'completed', 'ask'), '2026-11-17T09:00:00.000Z');

describe('asks settled lately, and the stage each started again', () => {
  test('newest first; each joined to the run whose cause names the asking run', () => {
    expect(recentlySettled(shippedView, [waiting, plan, deliver])).toEqual([
      {
        itemKey: 'd',
        answered: 2,
        withdrawn: 1,
        at: '2026-11-17T11:00:00.000Z',
        // deliver begins on Build.
        restart: { runId: 'run-d-1', status: 'completed', stageLabel: 'Build' },
      },
      {
        itemKey: 'p',
        answered: 2,
        withdrawn: 1,
        at: '2026-11-17T10:00:00.000Z',
        restart: { runId: 'run-p-1', status: 'running', stageLabel: 'Plan' },
      },
      { itemKey: 'w', answered: 2, withdrawn: 1, at: '2026-11-17T09:00:00.000Z', restart: null },
    ]);
  });

  test('only the newest few; an item with no settled set adds nothing', () => {
    const quiet = itemWith('q', [run('plan', 'completed', 'planned')]);
    const listed = recentlySettled(shippedView, [quiet, waiting, plan, deliver], 2);
    expect(listed.map(entry => entry.itemKey)).toEqual(['d', 'p']);
  });

  test('a run started by another cause is not a restart', () => {
    expect(asksSettledRunId({ kind: 'run_ended', runId: 'r', sourceInstanceId: 's' })).toBeNull();
    expect(asksSettledRunId(null)).toBeNull();
    expect(asksSettledRunId({ kind: 'asks_settled', runId: 'r' })).toBe('r');
  });
});
