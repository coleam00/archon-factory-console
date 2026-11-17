import { describe, expect, test } from 'bun:test';
import { askItem, gateItem, usageLimitItem } from '../needs-you.test-fixtures';
import { needsYou } from './needs-you';

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
