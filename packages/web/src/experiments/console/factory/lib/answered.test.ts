import { describe, expect, test } from 'bun:test';
import type { FactoryItem } from '../../skills/factory';
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
/** An ask of the set `deliver`'s first run left, closed with `chosen`. */
function askAnswer(
  question: string,
  chosen: { id: string; does: string } | null
): Extract<FactoryItem['answers'][number], { kind: 'ask' }> {
  return {
    kind: 'ask',
    runId: deliver.runs[0]?.id ?? '',
    node: null,
    occurrence: null,
    at: '2026-11-17T11:00:00.000Z',
    via: null,
    ref: `ask:${question}`,
    question,
    answer: null,
    chosen,
    withdrawn: false,
    by: null,
    fromRun: null,
  };
}
const waiting = settledItem('w', run('plan', 'completed', 'ask'), '2026-11-17T09:00:00.000Z');

describe('asks settled lately, and the stage each started again', () => {
  test('newest first; each joined to the run whose cause names the asking run', () => {
    const listed = recentlySettled(shippedView, [waiting, plan, deliver]);
    expect(
      listed.map(({ itemKey, runId, answered, withdrawn, at, restart }) => ({
        itemKey,
        runId,
        answered,
        withdrawn,
        at,
        restart,
      }))
    ).toEqual([
      {
        itemKey: 'd',
        runId: 'run-d-0',
        answered: 2,
        withdrawn: 1,
        at: '2026-11-17T11:00:00.000Z',
        // deliver begins on Build.
        restart: { runId: 'run-d-1', status: 'completed', label: 'Build' },
      },
      {
        itemKey: 'p',
        runId: 'run-p-0',
        answered: 2,
        withdrawn: 1,
        at: '2026-11-17T10:00:00.000Z',
        restart: { runId: 'run-p-1', status: 'running', label: 'Plan' },
      },
      {
        itemKey: 'w',
        runId: 'run-w-0',
        answered: 2,
        withdrawn: 1,
        at: '2026-11-17T09:00:00.000Z',
        restart: null,
      },
    ]);
  });

  test('without a view a restart is named by its workflow, and each ask by its answer in words', () => {
    const asks: FactoryItem['answers'] = [
      askAnswer('Send it back?', { id: 'send-back-once-more', does: 'Restarts the stage.' }),
      askAnswer('Which base?', { id: 'other', does: 'None of these.' }),
      { ...askAnswer('Split it?', null), withdrawn: true },
      { ...askAnswer('From another run?', null), runId: 'run-elsewhere' },
    ];
    const item = { ...deliver, answers: [...deliver.answers, ...asks], progress: null };
    const [entry] = recentlySettled(null, [item]);
    expect(entry?.restart).toEqual({
      runId: 'run-d-1',
      status: 'completed',
      label: 'Wirasm/archon-software-factory:deliver',
    });
    expect(entry?.asks).toEqual([
      { question: 'Send it back?', answer: 'Send back once more', withdrawn: false },
      { question: 'Which base?', answer: 'Something else', withdrawn: false },
      { question: 'Split it?', answer: 'withdrawn', withdrawn: true },
    ]);
    expect(entry?.askedAt).toBe(deliver.runs[0]?.completedAt ?? null);
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
