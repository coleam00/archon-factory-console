import { expect, test } from 'bun:test';
import type { ItemRead } from '../../skills/items';
import { orderSummary, workOrders } from './work-orders';

const ref = (key: string) => ({ id: key, projectKey: 'p', key, title: null });

/** A `part_of` link from or to `other`, active. */
const link = (other: string, direction: 'incoming' | 'outgoing') =>
  ({ kind: 'part_of', direction, ended: null, other: ref(other) }) as ItemRead['links'][number];

function read(
  key: string,
  state: ItemRead['standing']['state'],
  rest: { merged?: boolean; links?: ItemRead['links'] } = {}
): ItemRead {
  return {
    item: ref(key),
    standing: { runId: null, state, pack: null },
    runs: [],
    questions: [],
    links: rest.links ?? [],
    merged: rest.merged === true ? { at: '2026-11-20T10:00:00Z' } : null,
  } as unknown as ItemRead;
}

test('a split parent whose pieces all merged reads N of N merged and resolved', () => {
  // #171's shape: the order has no merge of its own and stands done through its parts.
  const [order] = workOrders([
    read('171-a', 'done', { merged: true, links: [link('171', 'outgoing')] }),
    read('171-b', 'done', { merged: true, links: [link('171', 'outgoing')] }),
    read('171', 'done', { links: [link('171-a', 'incoming'), link('171-b', 'incoming')] }),
  ]);
  expect(order === undefined ? null : orderSummary(order)).toEqual({
    merged: 2,
    total: 2,
    unstarted: 0,
    open: 0,
    resolved: true,
  });
});

test('a work order with no run of its own is listed, with its members not yet started', () => {
  // #48's shape: the order has no run; its read names a member the window does not list.
  const orders = workOrders([
    read('49', 'done', { merged: true, links: [link('48', 'outgoing')] }),
    read('48', 'resting', { links: [link('49', 'incoming'), link('50', 'incoming')] }),
  ]);
  expect(orders.map(order => [order.item.key, orderSummary(order)])).toEqual([
    ['48', { merged: 1, total: 2, unstarted: 1, open: 0, resolved: false }],
  ]);
});
