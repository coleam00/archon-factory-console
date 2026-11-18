import { describe, expect, test } from 'bun:test';
import { askItem, gateItem, usageLimitItem } from './needs-you.test-fixtures';
import { needsYou, needsYouCount, needsYouItemCount, needsYouPath } from './needs-you';

describe('needsYou', () => {
  test('orders newest first, untimed waits last in server order, and drops usage limits', () => {
    const older = askItem({ ref: 'ask:old', pausedAt: '2026-11-15T09:00:00.000Z' });
    const newer = askItem({ ref: 'ask:new', pausedAt: '2026-11-16T09:00:00.000Z' });
    const gateA = gateItem({ ref: 'gate:a' });
    const gateB = gateItem({ ref: 'gate:b' });
    const limit = usageLimitItem({ ref: 'limit:1', pausedAt: '2026-11-16T10:00:00.000Z' });
    const items = [gateA, older, limit, gateB, newer];

    const list = needsYou(items);

    expect(list.map(item => item.ref)).toEqual(['ask:new', 'ask:old', 'gate:a', 'gate:b']);
    // The input is left as the server sent it.
    expect(items.map(item => item.ref)).toEqual([
      'gate:a',
      'ask:old',
      'limit:1',
      'gate:b',
      'ask:new',
    ]);
  });

  test('a queue holding only a usage limit needs no one', () => {
    expect(needsYou([usageLimitItem({ ref: 'limit:1' })])).toEqual([]);
  });
});

describe('needsYouCount and needsYouItemCount', () => {
  test('count asks and waits, not usage limits; items once each, item-less waits by run', () => {
    const items = [
      askItem({ ref: 'ask:1' }),
      askItem({ ref: 'ask:2' }),
      askItem({ ref: 'ask:3', item: { id: 'item-9', projectKey: 'acme', key: '#9' } }),
      gateItem({ ref: 'gate:a' }),
      gateItem({ ref: 'gate:b' }),
      usageLimitItem(),
    ];
    expect(needsYouCount({ items })).toBe(5);
    // #7 (two asks), #9, and the one gate run holding both waits.
    expect(needsYouItemCount(needsYou(items))).toBe(3);
  });

  test('the tab path carries the ask it brings forward, encoded', () => {
    expect(needsYouPath('cb-1')).toBe('/console/p/cb-1/needs-you');
    expect(needsYouPath('cb-1', 'ask:a/b')).toBe('/console/p/cb-1/needs-you?ask=ask%3Aa%2Fb');
  });
});
