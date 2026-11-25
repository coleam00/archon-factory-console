import { expect, test } from 'bun:test';
import type { ItemRead } from '../skills/items';
import { flowCounts } from './OverviewPage';

const columns = [
  { name: 'Make', stages: ['plan', 'build'] },
  { name: 'Check', stages: ['check'] },
];

/** An item standing at a run of `workflow`, as far as the overview reads one. */
function item(workflow: string, rest: { asked?: boolean } = {}): ItemRead {
  return {
    standing: { runId: 'r1', state: rest.asked ? 'waiting' : 'running' },
    runs: [
      {
        id: 'r1',
        pack: { key: 'flow', workflow },
      },
    ],
    questions: rest.asked ? [{ kind: 'attention' }] : [],
  } as unknown as ItemRead;
}

test('each column counts the items standing at its stages and the ones that wait on the operator', () => {
  const counts = flowCounts(columns, [item('plan'), item('build', { asked: true }), item('check')]);
  expect(counts.map(column => [column.name, column.count, column.needYou])).toEqual([
    ['Make', 2, 1],
    ['Check', 1, 0],
  ]);
});
