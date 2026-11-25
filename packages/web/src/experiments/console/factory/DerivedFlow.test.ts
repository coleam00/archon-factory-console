import { expect, test } from 'bun:test';
import type { ItemRead } from '../skills/items';
import { flowCounts } from './DerivedFlow';

const columns = [
  { name: 'Make', stages: ['plan', 'build'] },
  { name: 'Check', stages: ['check'] },
];

/** An item standing at a run of `workflow`, as far as the derived flow reads one. */
function item(workflow: string, asked = false): ItemRead {
  return {
    standing: { runId: 'r1', state: asked ? 'waiting' : 'running' },
    runs: [{ id: 'r1', pack: { key: 'flow', workflow } }],
    questions: asked ? [{ kind: 'attention' }] : [],
  } as unknown as ItemRead;
}

test('each column counts the items standing at its stages and the ones that wait on the operator', () => {
  const counts = flowCounts(columns, [item('plan'), item('build', true), item('check')]);
  expect(counts.map(column => [column.name, column.count, column.needYou])).toEqual([
    ['Make', 2, 1],
    ['Check', 1, 0],
  ]);
});
